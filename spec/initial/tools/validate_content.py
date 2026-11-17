#!/usr/bin/env python3
"""ことば便の出題資材を、標準Pythonだけで再検査する。

規則表は data/romaji_rules_v1.json から読み、単一の正解綴りを持たない。
読み位置を節点とするDAGの最短路で基準長を計算する。
JSON Schemaは同梱スキーマで使用する静的な語彙だけをローカル処理する。
任意のJSON Schemaを処理する汎用バリデーターではない。
"""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from functools import lru_cache
import hashlib
import json
from pathlib import Path
import re
import sys


VERSIONS = {
    "schemaVersion": "2.0.0",
    "contentVersion": "2.0.0",
    "inputRuleVersion": "romaji-1.0.0",
    "dictionarySetId": "kotobabin-ja-960-v2",
}
RULE_SCHEMA_VERSION = "1.0.0"
TOTAL_COUNT = 960
TOPIC_COUNT = 160
LEGACY_SET_ID = "kotobabin-ja-240-v1"
LEGACY_FIELDS = ("id", "display", "reading", "courseId", "topicId", "canonicalLength")
LEGACY_REFERENCE_SHA256 = "a1ed3b81abfa7e47cc7384eaa383685b5467b1c8feb728397aad587d78dd61b8"
RULES_SHA256 = "ad14c84be1278610c53312dab60972b8dbd75e17d44fd36f02e071556ed5b014"
TUTORIAL_IDS = ("living_r01", "nature_r05", "daily_r07")
COURSES = ("relaxed", "standard", "challenge")
TOPICS = ("daily", "food", "living", "town", "nature", "people")
BANDS = ("easy", "medium", "hard")
TAG_ORDER = ("n", "sokuon", "yoon", "long_mark", "foreign")
COURSE_LIMITS = {"relaxed": (3, 8), "standard": (5, 14), "challenge": (10, 24)}
COURSE_COUNTS = {"relaxed": 240, "standard": 300, "challenge": 420}
CROSS_COUNTS = {topic: {"relaxed": 40, "standard": 50, "challenge": 70} for topic in TOPICS}
COURSE_WORD_IDS = {course: frozenset(f"{topic}_{initial}{index:02d}" for topic in TOPICS
                                   for index in range(1, CROSS_COUNTS[topic][course] + 1))
                   for course, initial in (("relaxed", "r"), ("standard", "s"), ("challenge", "c"))}
CURRENT_WORD_IDS = frozenset().union(*COURSE_WORD_IDS.values())
BAND_COUNTS = {
    "relaxed": {"easy": 96, "medium": 96, "hard": 48},
    "standard": {"easy": 120, "medium": 120, "hard": 60},
    "challenge": {"easy": 168, "medium": 168, "hard": 84},
}
COLLECTION_COUNTS = {LEGACY_SET_ID: 240, VERSIONS["dictionarySetId"]: TOTAL_COUNT,
                     **{f"kotobabin-ja-{course}-v2": count for course, count in COURSE_COUNTS.items()}}
DIFFICULTY_POLICY = {
    "method": "rank_within_course",
    "sortKeys": ["complexityScore", "canonicalLength", "id"],
    "shares": {"easy": 0.4, "medium": 0.4, "hard": 0.2},
    "scoreFormula": "L+n+2*sokuon+2*yoon+2*foreign+long_mark",
    "basis": "relative_editorial_criterion_not_measured_difficulty",
}
REVIEWED_MEANING = "作成時の表記と読みの校正済み。独立レビュー完了や実機検証済みを意味しない。"
LONG_MARK_MEANING = "読み内の長音記号「ー」の入力を対象とし、音声学上の長さを表さない。"

# 基準モデルの43正例と3負例。規則本体ではなく、固定した適合確認例。
REFERENCE_CASES = [
    ("し", "si shi ci", 2),
    ("ち", "ti chi", 2),
    ("つ", "tu tsu", 2),
    ("ふ", "fu hu", 2),
    ("きゃ", "kya kixya kilya", 3),
    ("しゃ", "sha sya shixya sixya", 3),
    ("てぃー", "thi- texi- teli-", 4),
    ("がっこう", "gakkou gaxtukou galtukou", 6),
    ("まっちゃ", "maccha matcha mattya maxtucha", 6),
    ("おんな", "onna onnna on'na oxnna", 4),
    ("かんい", "kanni kan'i kaxni", 5),
    ("しんや", "shinnya sinnya shin'ya sixnya", 6),
    ("かん", "kann kan' kaxn", 4),
    ("こんにちは", "konnichiha konnitiha konnnichiha", 9),
]
REFERENCE_NEGATIVES = [("かんい", "kani"), ("しんや", "shinya"), ("かん", "kan")]
ADDITIONAL_CASES = [
    ("しゃ", "cilya", True, 3),
    ("ゔぁ", "va", True, 2), ("ゔぁ", "vuxa", True, 2), ("ゔぁ", "vula", True, 2),
    ("じゃ", "zilya", True, 2), ("うぉ", "who", True, 3), ("うぉ", "whulo", True, 3),
    ("うぉ", "wo", False, 3), ("てぃ", "ti", False, 3), ("ぢ", "ji", False, 2),
    ("んう", "nwu", True, 3), ("んう", "nu", False, 3),
    ("んい", "nnyi", True, 3), ("んい", "nyi", False, 3),
    ("っちぇ", "tche", True, 4), ("っちぇ", "cche", True, 4), ("っちぇ", "tye", False, 4),
    ("っあ", "xtua", True, 4), ("っあ", "aa", False, 4),
    ("ん", "n'", True, 2), ("ん", "n", False, 2),
    ("てぃー", "thiー", False, 4), ("ねこ", "NEKO", True, 4),
    ("ねこ", "ne ko", False, 4), ("ねこ", "neKo", False, 4),
    # 次の4例は判定器の適合確認用であり、問題データの候補ではない。
    ("あっ", "axtu", True, 4), ("っっか", "xtukka", True, 4),
    ("っい", "yyi", True, 3), ("っー", "--", True, 2),
]


class RomajiEngine:
    """受理表の全辺を残す読み位置DAG。完成経路の全列挙は行わない。"""

    def __init__(self, rules):
        if not isinstance(rules, dict):
            raise ValueError("入力規則はJSONオブジェクトである必要があります")
        if rules.get("inputRuleVersion") != VERSIONS["inputRuleVersion"]:
            raise ValueError("入力規則の版が一致しません")
        if rules.get("schemaVersion") != RULE_SCHEMA_VERSION:
            raise ValueError("規則資材のスキーマ版が一致しません")
        groups = rules.get("tables", {})
        if not isinstance(groups, dict):
            raise ValueError("入力受理表はJSONオブジェクトである必要があります")
        self.basic = groups.get("basic", {})
        self.yoon = groups.get("yoon", {})
        self.foreign = groups.get("foreign", {})
        expected_sizes = {"basic": 81, "yoon": 36, "foreign": 21}
        self.table = {}
        for group_name, expected_size in expected_sizes.items():
            group = groups.get(group_name)
            if not isinstance(group, dict) or len(group) != expected_size:
                raise ValueError(f"{group_name}の受理表が{expected_size}項目ではありません")
            for kana, spellings in group.items():
                expected_kana_length = 1 if group_name == "basic" else 2
                if not isinstance(kana, str) or len(kana) != expected_kana_length:
                    raise ValueError(f"受理表の読みが不正です: {kana!r}")
                if kana in self.table:
                    raise ValueError(f"受理表のキーが重複しています: {kana}")
                if not isinstance(spellings, list) or not spellings or any(
                    not isinstance(s, str) or not re.fullmatch(r"[a-z'-]+", s) for s in spellings
                ) or len(set(spellings)) != len(spellings):
                    raise ValueError(f"受理表の綴りが不正です: {kana}")
                self.table[kana] = tuple(spellings)
        self.nasal = rules["nasal"]
        self.sokuon = rules["sokuon"]
        self.restrictions = rules["contentRestrictions"]
        if self.nasal["kana"] != "ん" or self.sokuon["kana"] != "っ":
            raise ValueError("特殊入力の仮名が一致しません")
        if "ん" in self.basic or "っ" not in self.basic:
            raise ValueError("んとっの規則配置が不正です")
        if tuple(rules["tagOrder"]) != TAG_ORDER:
            raise ValueError("タグの順序が一致しません")
        if rules.get("normalization") != {"input": "ascii_lowercase", "reading": "none"}:
            raise ValueError("入力正規化の契約が一致しません")
        self.supported_chars = frozenset(self.basic) | {self.nasal["kana"]}
        self._table_items = tuple(sorted(self.table.items()))

    @lru_cache(maxsize=1024)
    def graph(self, reading):
        """edges[i] = (次の読み位置, ASCII入力列)の集合を返す。"""
        if not isinstance(reading, str):
            raise TypeError("reading must be a string")
        edges = [()] * (len(reading) + 1)
        for position in range(len(reading) - 1, -1, -1):
            candidates = set()
            for kana, spellings in self._table_items:
                if reading.startswith(kana, position):
                    candidates.update((position + len(kana), spelling) for spelling in spellings)
            if reading[position] == self.nasal["kana"]:
                candidates.update((position + 1, spelling) for spelling in self.nasal["always"])
                for destination, spelling in edges[position + 1]:
                    if spelling[0] not in self.nasal["blockedNextInitials"]:
                        candidates.add((destination, self.nasal["contextPrefix"] + spelling))
            if reading[position] == self.sokuon["kana"]:
                for destination, spelling in edges[position + 1]:
                    if spelling[0] not in self.sokuon["blockedNextInitials"]:
                        candidates.add((destination, spelling[0] + spelling))
                    if spelling.startswith(tuple(self.sokuon["tPrefixBefore"])):
                        candidates.add((destination, self.sokuon["tPrefix"] + spelling))
            edges[position] = tuple(sorted(candidates))
        return tuple(edges)

    def canonical_length(self, reading):
        """DAGの末端から最短距離を計算する。受理経路がなければNone。"""
        graph = self.graph(reading)
        distance = [None] * (len(reading) + 1)
        distance[-1] = 0
        for position in range(len(reading) - 1, -1, -1):
            choices = [len(spelling) + distance[destination]
                       for destination, spelling in graph[position]
                       if distance[destination] is not None]
            if choices:
                distance[position] = min(choices)
        return distance[0]

    def accepts(self, reading, raw):
        """入力済み文字数と読み位置の状態集合を進め、全文受理を判定する。"""
        if not isinstance(raw, str) or re.fullmatch(r"[A-Za-z'-]*", raw) is None:
            return False
        raw = raw.lower()
        graph = self.graph(reading)
        consumed_at = [set() for _ in range(len(reading) + 1)]
        consumed_at[0].add(0)
        for position in range(len(reading)):
            for consumed in consumed_at[position]:
                for destination, spelling in graph[position]:
                    if raw.startswith(spelling, consumed):
                        consumed_at[destination].add(consumed + len(spelling))
        return len(raw) in consumed_at[-1]

    def analyze(self, reading):
        length = self.canonical_length(reading)
        if length is None:
            raise ValueError("受理可能な経路がありません")
        counts = {
            "n": reading.count(self.nasal["kana"]),
            "sokuon": reading.count(self.sokuon["kana"]),
            "yoon": sum(reading[i:i + 2] in self.yoon for i in range(len(reading) - 1)),
            "long_mark": reading.count("ー"),
            "foreign": sum(reading[i:i + 2] in self.foreign for i in range(len(reading) - 1)),
        }
        score = length + counts["n"] + 2 * counts["sokuon"] + 2 * counts["yoon"]
        score += 2 * counts["foreign"] + counts["long_mark"]
        return {"canonicalLength": length, "complexityScore": score,
                "tags": [tag for tag in TAG_ORDER if counts[tag]], "counts": counts}


def run_rule_conformance(engine):
    errors = []
    accepted_total = accepted_passed = length_passed = 0
    for reading, spellings, expected_length in REFERENCE_CASES:
        if engine.canonical_length(reading) == expected_length:
            length_passed += 1
        else:
            errors.append(f"基準長不一致: {reading}")
        for raw in spellings.split():
            accepted_total += 1
            if engine.accepts(reading, raw):
                accepted_passed += 1
            else:
                errors.append(f"既存正例の受理失敗: {reading}/{raw}")
    negative_passed = 0
    for reading, raw in REFERENCE_NEGATIVES:
        if not engine.accepts(reading, raw):
            negative_passed += 1
        else:
            errors.append(f"既存負例の誤受理: {reading}/{raw}")
    additional_passed = 0
    for reading, raw, accepted, length in ADDITIONAL_CASES:
        if engine.accepts(reading, raw) == accepted and engine.canonical_length(reading) == length:
            additional_passed += 1
        else:
            errors.append(f"追加例の不一致: {reading}/{raw}")
    return {
        "ok": not errors,
        "referenceAcceptedPaths": {"passed": accepted_passed, "total": accepted_total},
        "referenceRejectedPaths": {"passed": negative_passed, "total": len(REFERENCE_NEGATIVES)},
        "referenceCanonicalLengths": {"passed": length_passed, "total": len(REFERENCE_CASES)},
        "additionalCases": {"passed": additional_passed, "total": len(ADDITIONAL_CASES)},
        "errors": errors,
    }


def expected_bands(words):
    result = {}
    for course in COURSES:
        selected = sorted((word for word in words if word.get("courseId") == course),
                          key=lambda word: (word["complexityScore"], word["canonicalLength"], word["id"]))
        easy_end = BAND_COUNTS[course]["easy"]
        medium_end = easy_end + BAND_COUNTS[course]["medium"]
        for index, word in enumerate(selected):
            result[word["id"]] = "easy" if index < easy_end else "medium" if index < medium_end else "hard"
    return result


def _json_equal(left, right):
    return json.dumps(left, ensure_ascii=False, sort_keys=True) == json.dumps(right, ensure_ascii=False, sort_keys=True)


def content_digest(value):
    """空白とオブジェクトのキー順を除いた、固定参照資材の指紋。"""
    serialized = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def schema_issues(value, schema, root=None, path="$"):
    """同梱スキーマで使用するDraft 2020-12の静的語彙を検査する。"""
    root = schema if root is None else root
    if isinstance(schema, bool):
        return [] if schema else [f"{path}: 許可されていない値です"]
    allowed_keywords = {
        "$schema", "$id", "$ref", "$defs", "$comment", "title", "description", "examples", "default",
        "type", "const", "enum", "required", "properties", "additionalProperties", "items",
        "minItems", "maxItems", "uniqueItems", "minLength", "maxLength", "pattern", "minimum", "maximum",
        "allOf", "if", "then", "else", "contains", "minContains", "maxContains",
    }
    unknown = set(schema) - allowed_keywords
    if unknown:
        return [f"{path}: この検査器で未対応のスキーマ語彙です: {sorted(unknown)}"]
    issues = []
    if "$ref" in schema:
        ref = schema["$ref"]
        if not ref.startswith("#/"):
            return [f"{path}: 外部スキーマ参照は使用できません"]
        target = root
        try:
            for part in ref[2:].split("/"):
                target = target[part.replace("~1", "/").replace("~0", "~")]
        except (KeyError, TypeError):
            return [f"{path}: スキーマの参照先がありません: {ref}"]
        issues.extend(schema_issues(value, target, root, path))
    type_tests = {
        "object": isinstance(value, dict), "array": isinstance(value, list), "string": isinstance(value, str),
        "boolean": type(value) is bool, "integer": type(value) is int,
        "number": type(value) in (int, float), "null": value is None,
    }
    if "type" in schema and not type_tests.get(schema["type"], False):
        return issues + [f"{path}: 型は{schema['type']}である必要があります"]
    if "const" in schema and not _json_equal(value, schema["const"]):
        issues.append(f"{path}: 固定値が一致しません")
    if "enum" in schema and not any(_json_equal(value, candidate) for candidate in schema["enum"]):
        issues.append(f"{path}: 列挙値の範囲外です")
    if isinstance(value, dict):
        for key in schema.get("required", []):
            if key not in value:
                issues.append(f"{path}.{key}: 必須フィールドがありません")
        properties = schema.get("properties", {})
        for key, child in properties.items():
            if key in value:
                issues.extend(schema_issues(value[key], child, root, f"{path}.{key}"))
        if schema.get("additionalProperties") is False:
            for key in sorted(set(value) - set(properties)):
                issues.append(f"{path}.{key}: 未定義のフィールドです")
    if isinstance(value, list):
        if "minItems" in schema and len(value) < schema["minItems"]:
            issues.append(f"{path}: 要素数が不足しています")
        if "maxItems" in schema and len(value) > schema["maxItems"]:
            issues.append(f"{path}: 要素数が上限を超えています")
        if schema.get("uniqueItems"):
            serialized = [json.dumps(item, ensure_ascii=False, sort_keys=True) for item in value]
            if len(serialized) != len(set(serialized)):
                issues.append(f"{path}: 要素が重複しています")
        if "items" in schema:
            for index, item in enumerate(value):
                issues.extend(schema_issues(item, schema["items"], root, f"{path}[{index}]"))
        if "contains" in schema:
            matches = sum(not schema_issues(item, schema["contains"], root) for item in value)
            if matches < schema.get("minContains", 1) or matches > schema.get("maxContains", len(value)):
                issues.append(f"{path}: containsの件数制約を満たしません（{matches}件）")
    if isinstance(value, str):
        if "minLength" in schema and len(value) < schema["minLength"]:
            issues.append(f"{path}: 文字数が不足しています")
        if "maxLength" in schema and len(value) > schema["maxLength"]:
            issues.append(f"{path}: 文字数が上限を超えています")
        if "pattern" in schema and re.search(schema["pattern"], value) is None:
            issues.append(f"{path}: 文字種または形式が一致しません")
    if type(value) in (int, float):
        if "minimum" in schema and value < schema["minimum"]:
            issues.append(f"{path}: 最小値を下回っています")
        if "maximum" in schema and value > schema["maximum"]:
            issues.append(f"{path}: 最大値を超えています")
    for child in schema.get("allOf", []):
        issues.extend(schema_issues(value, child, root, path))
    if "if" in schema:
        branch = "then" if not schema_issues(value, schema["if"], root, path) else "else"
        if branch in schema:
            issues.extend(schema_issues(value, schema[branch], root, path))
    return issues


def validate_document(document, rules, schema, legacy_index=None):
    errors, warnings = [], []

    def fail(code, message, word_id=None):
        issue = {"code": code, "message": message}
        if word_id is not None:
            issue["wordId"] = word_id
        errors.append(issue)

    for message in schema_issues(document, schema):
        fail("schema", message)
    if not isinstance(document, dict) or not isinstance(document.get("words"), list):
        return {"ok": False, "errors": errors, "warnings": warnings}
    rules_digest = content_digest(rules)
    if rules_digest != RULES_SHA256:
        fail("rules_immutable", "入力規則romaji-1.0.0の内容が固定参照と一致しません")
        return {"ok": False, "errors": errors, "warnings": warnings}
    try:
        engine = RomajiEngine(rules)
    except (KeyError, TypeError, ValueError) as exc:
        fail("rules", str(exc))
        return {"ok": False, "errors": errors, "warnings": warnings}
    conformance = run_rule_conformance(engine)
    for message in conformance["errors"]:
        fail("rule_conformance", message)
    words = document["words"]
    if len(words) != TOTAL_COUNT:
        fail("total_count", f"全体は{TOTAL_COUNT}件が必要です（実際は{len(words)}件）")
    records = [word for word in words if isinstance(word, dict)]
    for field in ("id", "display", "reading"):
        groups = defaultdict(list)
        for word in records:
            if isinstance(word.get(field), str):
                groups[word[field]].append(word.get("id", "<IDなし>"))
        for value, ids in groups.items():
            if len(ids) > 1:
                fail(f"duplicate_{field}", f"{field}が重複しています: {value}（{', '.join(map(str, ids))}）")
    course_counts = Counter(word.get("courseId") for word in records if isinstance(word.get("courseId"), str))
    topic_counts = Counter(word.get("topicId") for word in records if isinstance(word.get("topicId"), str))
    cross_counts = {topic: {course: sum(word.get("topicId") == topic and word.get("courseId") == course
                                      for word in records) for course in COURSES} for topic in TOPICS}
    for course, expected in COURSE_COUNTS.items():
        if course_counts[course] != expected:
            fail("course_count", f"{course}は{expected}件が必要です（実際は{course_counts[course]}件）")
    for topic in TOPICS:
        if topic_counts[topic] != TOPIC_COUNT:
            fail("topic_count", f"{topic}は{TOPIC_COUNT}件が必要です（実際は{topic_counts[topic]}件）")
        for course in COURSES:
            if cross_counts[topic][course] != CROSS_COUNTS[topic][course]:
                fail("cross_count", f"{topic}/{course}の件数が一致しません")
    analyses, ranked_words = {}, []
    for word in records:
        word_id, reading = word.get("id"), word.get("reading")
        if not isinstance(word_id, str) or not isinstance(reading, str):
            continue
        if not reading or set(reading) - engine.supported_chars:
            fail("unsupported_kana", f"未対応の読み文字があります: {reading}", word_id)
            continue
        if "っっ" in reading or reading.endswith("っ"):
            fail("forbidden_sokuon", "連続するっ、または語末のっが含まれています", word_id)
        if word.get("courseId") == "relaxed" and set(reading) & set(engine.restrictions["relaxedForbiddenChars"]):
            fail("relaxed_complexity", "ゆったりコースに複雑な入力要素があります", word_id)
        try:
            analysis = engine.analyze(reading)
        except ValueError as exc:
            fail("unreachable_reading", str(exc), word_id)
            continue
        analyses[word_id] = analysis
        for field in ("canonicalLength", "tags"):
            if word.get(field) != analysis[field]:
                fail(f"derived_{field}", f"{field}の再計算結果が一致しません", word_id)
        if word.get("complexityScore") != analysis["complexityScore"]:
            fail("derived_complexityScore", "複雑度の再計算結果が一致しません", word_id)
        course = word.get("courseId")
        if isinstance(course, str) and course in COURSE_LIMITS:
            lower, upper = COURSE_LIMITS[course]
            if not lower <= analysis["canonicalLength"] <= upper:
                fail("course_length", f"基準長は{lower}〜{upper}である必要があります", word_id)
        ranked_words.append({"id": word_id, "courseId": course,
                             "canonicalLength": analysis["canonicalLength"],
                             "complexityScore": analysis["complexityScore"]})
    bands = expected_bands(ranked_words)
    band_counts = {course: {band: sum(word.get("courseId") == course and word.get("difficultyBand") == band
                                    for word in records) for band in BANDS} for course in COURSES}
    for word in records:
        word_id = word.get("id")
        if isinstance(word_id, str) and word_id in bands and word.get("difficultyBand") != bands[word_id]:
            fail("difficulty_rank", f"難度帯は{bands[word_id]}である必要があります", word_id)
    for course in COURSES:
        for band in BANDS:
            if band_counts[course][band] != BAND_COUNTS[course][band]:
                fail("band_count", f"{course}/{band}の件数が一致しません")
            if band_counts[course][band] == 0:
                fail("empty_band", f"{course}/{band}が空です")
    by_id = {word["id"]: word for word in records if isinstance(word.get("id"), str)}
    if set(by_id) != CURRENT_WORD_IDS:
        fail("word_id_set", "現在版960件の固定ID集合が一致しません")

    legacy_digest = content_digest(legacy_index)
    legacy_reference_ok = legacy_digest == LEGACY_REFERENCE_SHA256
    if not legacy_reference_ok:
        fail("legacy_reference", "初版240件の固定参照資材が一致しません")
    legacy_rows = legacy_index.get("words", []) if isinstance(legacy_index, dict) else []
    if not isinstance(legacy_rows, list):
        legacy_rows = []
    legacy_rows = [row for row in legacy_rows if isinstance(row, dict) and isinstance(row.get("id"), str)]
    legacy_ids = {row["id"] for row in legacy_rows}
    legacy_matched = 0
    legacy_differences = []
    for old in legacy_rows:
        current = by_id.get(old["id"])
        if current is None:
            fail("legacy_missing", "初版の語が現在の出題データにありません", old["id"])
            legacy_differences.append({"wordId": old["id"], "fields": ["missing"]})
            continue
        changed = [field for field in LEGACY_FIELDS if current.get(field) != old.get(field)]
        if changed:
            fail("legacy_changed", "初版から固定する項目が変わっています: " + ", ".join(changed), old["id"])
            legacy_differences.append({"wordId": old["id"], "fields": changed})
        else:
            legacy_matched += 1

    expected_sets = {LEGACY_SET_ID: legacy_ids, VERSIONS["dictionarySetId"]: CURRENT_WORD_IDS}
    expected_sets.update({f"kotobabin-ja-{course}-v2": COURSE_WORD_IDS[course] for course in COURSES})
    collections = document.get("collectionSets")
    if not isinstance(collections, dict):
        fail("collection_sets", "collectionSetsは固定集合IDをキーに持つオブジェクトである必要があります")
        collections = {}
    if set(collections) != set(COLLECTION_COUNTS):
        fail("collection_keys", "固定集合IDの構成が一致しません")
    collection_report = {}
    for collection_id, expected_count in COLLECTION_COUNTS.items():
        members = collections.get(collection_id)
        valid_list = isinstance(members, list) and all(isinstance(value, str) for value in members)
        actual_members = members if valid_list else []
        if not valid_list:
            fail("collection_shape", f"{collection_id}は語IDの配列である必要があります")
        if len(actual_members) != expected_count:
            fail("collection_count", f"{collection_id}は{expected_count}件が必要です")
        if len(set(actual_members)) != len(actual_members):
            fail("collection_duplicate", f"{collection_id}に同じ語IDが複数あります")
        unknown = sorted(set(actual_members) - set(by_id))
        if unknown:
            fail("unknown_reference", f"{collection_id}の参照先がありません: {', '.join(unknown)}")
        membership_matches = valid_list and set(actual_members) == expected_sets[collection_id]
        if not membership_matches:
            fail("collection_membership", f"{collection_id}の固定ID集合が一致しません")
        collection_report[collection_id] = {"expectedCount": expected_count, "actualCount": len(actual_members),
                                            "membershipMatches": membership_matches}

    def referenced_rows(field):
        values = document.get(field, [])
        if not isinstance(values, list):
            return []
        result = []
        for value in values:
            if not isinstance(value, str) or value not in by_id:
                fail("unknown_reference", f"{field}の参照先がありません: {value!r}")
            else:
                result.append(by_id[value])
        return result

    prototype = referenced_rows("prototypeIds")
    if len(prototype) != 30:
        fail("prototype_count", "試作は30件が必要です")
    prototype_course_counts = {course: sum(word.get("courseId") == course for word in prototype) for course in COURSES}
    prototype_band_counts = {course: {band: sum(word.get("courseId") == course and word.get("difficultyBand") == band
                                              for word in prototype) for band in BANDS} for course in COURSES}
    prototype_topic_counts = {topic: sum(word.get("topicId") == topic for word in prototype) for topic in TOPICS}
    for course in COURSES:
        if prototype_course_counts[course] != 10:
            fail("prototype_course_count", f"試作の{course}は10件が必要です")
        for band, expected in (("easy", 4), ("medium", 4), ("hard", 2)):
            if prototype_band_counts[course][band] != expected:
                fail("prototype_band_count", f"試作の{course}/{band}は{expected}件が必要です")
    balanced = all(count == 5 for count in prototype_topic_counts.values())
    if document.get("prototypeTopicBalanced") is not balanced:
        fail("prototype_balance_metadata", "試作分類バランスのメタデータが一致しません")
    if not balanced:
        fail("prototype_topic_balance", "試作30件で各分類5件の構成を満たしていません")
    prototype_course_topics = {course: {topic: sum(word.get("courseId") == course and word.get("topicId") == topic
                                                  for word in prototype) for topic in TOPICS} for course in COURSES}
    for course in COURSES:
        if not all(prototype_course_topics[course].values()):
            fail("prototype_course_topics", f"試作の{course}に全6分類が含まれていません")
    prototype_tag_counts = {tag: sum(tag in analyses.get(word["id"], {}).get("tags", [])
                                     for word in prototype) for tag in TAG_ORDER}
    if not all(prototype_tag_counts.values()):
        fail("prototype_tag_coverage", "試作全体に5種類の入力要素が含まれていません")
    tutorials = referenced_rows("tutorialIds")
    if document.get("tutorialIds") != list(TUTORIAL_IDS):
        fail("tutorial_identity", "導入語のIDと順序は猫・花・傘の3語で固定です")
    for word in tutorials:
        analysis = analyses.get(word.get("id"))
        if word.get("courseId") != "relaxed" or analysis is None or not 3 <= analysis["canonicalLength"] <= 8 or analysis["tags"]:
            fail("tutorial_complexity", "導入語はゆったりコースの短い語である必要があります", word.get("id"))
    length_ranges, score_ranges = {}, {}
    for course in COURSES:
        selected = [analyses[word["id"]] for word in records
                    if word.get("courseId") == course and isinstance(word.get("id"), str) and word["id"] in analyses]
        if selected:
            length_ranges[course] = {"min": min(item["canonicalLength"] for item in selected),
                                     "max": max(item["canonicalLength"] for item in selected)}
            score_ranges[course] = {"min": min(item["complexityScore"] for item in selected),
                                    "max": max(item["complexityScore"] for item in selected)}
    return {
        "ok": not errors, "versions": VERSIONS, "inputRuleSchemaVersion": RULE_SCHEMA_VERSION,
        "inputRulesImmutable": {"ok": rules_digest == RULES_SHA256, "sha256": rules_digest},
        "totalCount": len(words),
        "courseCounts": dict(course_counts), "topicCounts": dict(topic_counts), "crossCounts": cross_counts,
        "difficultyBandCounts": band_counts, "canonicalLengthRanges": length_ranges, "complexityScoreRanges": score_ranges,
        "maxDisplayLength": max((len(word["display"]) for word in records if isinstance(word.get("display"), str)), default=0),
        "maxReadingLength": max((len(word["reading"]) for word in records if isinstance(word.get("reading"), str)), default=0),
        "tagWordCounts": {tag: sum(tag in analysis["tags"] for analysis in analyses.values()) for tag in TAG_ORDER},
        "tagOccurrenceCounts": {tag: sum(analysis["counts"][tag] for analysis in analyses.values()) for tag in TAG_ORDER},
        "collectionSets": collection_report,
        "legacyRetention": {"ok": legacy_reference_ok and legacy_matched == 240 and not legacy_differences,
                            "referenceCount": len(legacy_rows), "matchedCount": legacy_matched,
                            "fixedFields": list(LEGACY_FIELDS), "referenceSha256": legacy_digest,
                            "differences": legacy_differences},
        "prototype": {
            "count": len(prototype), "courseCounts": prototype_course_counts,
            "bandCounts": prototype_band_counts, "topicCounts": prototype_topic_counts, "topicBalanced": balanced,
            "courseTopicCounts": prototype_course_topics,
            "tagWordCounts": prototype_tag_counts,
        },
        "tutorials": [{"id": word["id"], "display": word.get("display"), "reading": word.get("reading")} for word in tutorials],
        "ruleConformance": conformance, "errors": errors, "warnings": warnings,
    }


def load_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def main(argv=None):
    parser = argparse.ArgumentParser(description="ことば便の960件、入力規則、難度帯、固定集合、初版240件を再検査する")
    parser.add_argument("--data-dir", type=Path, default=Path(__file__).resolve().parents[1] / "data")
    parser.add_argument("--json", action="store_true", help="機械可読の検査報告を標準出力へ出す")
    parser.add_argument("--report", type=Path, help="検査報告JSONの保存先")
    args = parser.parse_args(argv)
    try:
        report = validate_document(load_json(args.data_dir / "words.json"),
                                   load_json(args.data_dir / "romaji_rules_v1.json"),
                                   load_json(args.data_dir / "words.schema.json"),
                                   load_json(args.data_dir / "legacy_word_index_v1.json"))
    except (OSError, UnicodeError, json.JSONDecodeError, KeyError, TypeError, ValueError) as exc:
        report = {"ok": False, "errors": [{"code": "load_or_contract_error", "message": str(exc)}], "warnings": []}
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print(f"{'PASS' if report['ok'] else 'FAIL'}: ことば便 出題データ検査")
        if "totalCount" in report:
            print(f"出題数: {report['totalCount']} / {TOTAL_COUNT}")
            print(f"コース件数: {report['courseCounts']}")
            print(f"難度帯件数: {report['difficultyBandCounts']}")
            print(f"試作: {report['prototype']['count']}件、分類件数: {report['prototype']['topicCounts']}")
            print(f"初版固定項目: {report['legacyRetention']['matchedCount']} / 240")
            print("固定集合: " + ", ".join(f"{name}={value['actualCount']}" for name, value in report['collectionSets'].items()))
            checks = report["ruleConformance"]
            print("規則適合: " + ", ".join(f"{name}={checks[name]['passed']}/{checks[name]['total']}" for name in (
                "referenceAcceptedPaths", "referenceRejectedPaths", "referenceCanonicalLengths", "additionalCases")))
        for issue in report.get("errors", []):
            print(f"ERROR [{issue['code']}] {issue.get('wordId', '')} {issue['message']}")
        for issue in report.get("warnings", []):
            print(f"WARNING [{issue['code']}] {issue['message']}")
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
