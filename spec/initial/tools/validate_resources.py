#!/usr/bin/env python3
"""Validate the resource contracts and refresh the Japanese reports.

Run from the package root: python3 tools/validate_resources.py
Only Python's standard library is used. Planned production assets need not exist.
The contract checks do not certify artwork, runtime rendering, or play quality.
"""
from collections import Counter, defaultdict
from copy import deepcopy
from fractions import Fraction
from hashlib import sha256
from pathlib import Path, PurePosixPath
import json
import re
import struct
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]
DATA_NAMES = (
    "achievement_catalog", "city_catalog", "equipment_catalog",
    "rendering_rules", "visual_resource_manifest", "economy_config",
)
GROUP_NAMES = {
    "source": "原本・版・参考画面",
    "achievements": "実績・称号・追加報酬",
    "city": "地区・段階・景観",
    "equipment": "設備・価格・鉄道・連携・研究",
    "manifest": "資材件数・型・制作条件",
    "references": "正参照・逆参照・表示状態",
    "geometry": "地図座標・固定経路",
    "markdown": "生成文書の再現一致",
    "mutation": "破損注入による検出確認",
}
CATEGORY_COUNTS = {
    "achievement_stamp": 72, "bgm": 1, "brand": 1, "cargo": 1,
    "city_plot": 1, "city_shared": 2, "city_stage": 30,
    "construction": 3, "course_icon": 3, "district_icon": 6,
    "equipment_icon": 4, "equipment_scene": 5, "family_emblem": 12,
    "milestone_raster": 4, "milestone_svg": 11, "postcard": 12,
    "research_icon": 3, "resource_icon": 3, "shared_frame": 5,
    "shop_overlay": 3, "shop_scene": 6, "sound_effect": 6,
    "synergy_icon": 3, "terrain": 3, "topic_icon": 6,
    "ui_icon": 32, "vehicle": 10,
}
RASTER_CATEGORIES = {
    "achievement_stamp", "cargo", "city_plot", "city_shared", "city_stage",
    "construction", "equipment_scene", "milestone_raster", "postcard",
    "shop_scene", "terrain", "vehicle",
}
SCREENS = {
    "DICTIONARY", "DISTRICT_DETAIL", "HANDBOOK", "HOME", "NEW_CITY",
    "PAUSE", "PLAY", "PRACTICE", "RESULT", "RETURN", "SETTINGS",
    "TUTORIAL", "UPGRADES",
}
# Fixed layout profiles are independent of the asset-to-profile assignments.
# source size, alpha, anchor; icon/emblem sizes are their individual SVG viewBoxes.
PROFILE_CONTRACTS = {
    "stamp": ([512, 512], True, [256, 256]),
    "icon": ("viewBoxに従う", True, "中央"),
    "emblem": ("viewBoxに従う", True, "中央"),
    "postcard": ([1600, 1000], False, [800, 500]),
    "evening_panel": ([1600, 400], False, [800, 200]),
    "frame": ([1200, 800], True, [600, 400]),
    "board": ([1200, 800], True, [600, 400]),
    "ornament": ([1024, 256], True, [512, 256]),
    "district": ([1024, 768], True, [512, 640]),
    "terrain": ([3200, 2000], False, [1600, 1000]),
    "shop": ([512, 512], True, [256, 448]),
    "packaging": ([1200, 800], True, [600, 680]),
    "vehicle": ([256, 192], True, [128, 160]),
    "hub": ([512, 512], True, [256, 448]),
    "freight": ([512, 384], True, [256, 320]),
    "cargo": ([256, 256], True, [128, 192]),
    "audio": (None, None, None),
    "stamp_frame": ([640, 640], True, [320, 320]),
    "memorial_frame": ([640, 640], True, [320, 320]),
}
UI_IDS = "home play practice dictionary handbook settings lock check pin unread info warning search filter sort back chevron close retry pause sound guide text_size motion more question clock route plan new_city history stop".split()
COMPONENT_IDS = (
    "stamp_frame memorial_frame board_base board_foil album_base brand_mark city_hub "
    "scaffold_small scaffold_medium scaffold_large cargo_parcel"
).split() + ["ui_" + x for x in UI_IDS] + (
    "resource_material resource_coin resource_blueprint course_relaxed course_standard "
    "course_challenge topic_daily topic_food topic_living topic_town topic_nature "
    "topic_people audio_key audio_word audio_dispatch_small audio_dispatch_medium "
    "audio_dispatch_full audio_mistake audio_theme"
).split()


def rational(value):
    """Convert decimal text/numbers exactly, without binary float arithmetic."""
    if isinstance(value, bool):
        raise ValueError("boolean is not a numeric contract value")
    return Fraction(str(value))


def ceil_fraction(value):
    return -(-value.numerator // value.denominator)


def compact(value):
    if isinstance(value, Fraction):
        return str(value)
    if isinstance(value, (set, frozenset)):
        return sorted(value)
    return value


def nonempty(value):
    return isinstance(value, str) and bool(value.strip())


class Validation:
    def __init__(self, documents, context):
        self.docs = documents
        self.context = context
        self.group = "source"
        self.groups = defaultdict(lambda: {"checks": 0, "failures": 0})
        self.errors = []
        self.metrics = {}
        self.resolved_assets = []

    def check(self, condition, code, path, actual=None, expected=None):
        self.groups[self.group]["checks"] += 1
        if not condition:
            self.groups[self.group]["failures"] += 1
            self.errors.append({
                "group": self.group, "code": code, "path": path,
                "actual": compact(actual), "expected": compact(expected),
            })
        return bool(condition)

    def equal(self, actual, expected, code, path):
        return self.check(actual == expected, code, path, actual, expected)

    def numeric(self, actual, expected, code, path):
        try:
            same = rational(actual) == rational(expected)
        except (ValueError, TypeError, ZeroDivisionError):
            same = False
        return self.check(same, code, path, actual, str(expected))

    def unique(self, values, code, path):
        return self.check(len(values) == len(set(values)), code, path,
                          [x for x, n in Counter(values).items() if n > 1], [])

    def texts(self, obj, keys, code, path):
        for key in keys:
            self.check(nonempty(obj.get(key)), code, path + "." + key,
                       obj.get(key), "空でない文字列")

    def run(self):
        for group, method in [
            ("source", self.sources), ("achievements", self.achievements),
            ("city", self.city), ("equipment", self.equipment),
            ("manifest", self.manifest), ("references", self.references),
            ("geometry", self.geometry),
        ]:
            self.group = group
            try:
                method()
            except (KeyError, TypeError, ValueError, IndexError, AttributeError, ZeroDivisionError) as exc:
                self.check(False, "INPUT.structure", group,
                           type(exc).__name__ + ": " + str(exc), "検査可能な構造")
        return self

    def sources(self):
        for name in DATA_NAMES:
            doc = self.docs[name]
            self.equal(doc.get("schema_version"), "1.0.0", "SOURCE.schema", name)
            if name != "economy_config":
                self.equal(doc.get("catalog_version"), "4.1.0", "SOURCE.catalog_version", name)
        ec = self.docs["economy_config"]
        self.equal(ec["economy_version"], "4.0.0", "SOURCE.economy_version", "economy_config")
        for name in ["city_catalog", "equipment_catalog"]:
            self.equal(self.docs[name]["economy_version"], ec["economy_version"],
                       "SOURCE.economy_version", name)
        contracts = self.docs["visual_resource_manifest"]["source_contracts"]
        self.equal(set(contracts), {"economy_config.json", "words.json", "words.schema.json", "romaji_rules_v1.json"},
                   "SOURCE.contract_set", "source_contracts")
        for name, contract in contracts.items():
            self.equal(contract["sha256"], self.context["source_digests"].get(name),
                       "SOURCE.sha256", "source_contracts." + name)
            self.check(nonempty(contract.get("policy")), "SOURCE.policy", name)
        self.metrics["unchanged_source_contracts"] = len(contracts)
        refs = self.docs["visual_resource_manifest"]["reference_images"]
        self.equal(len(refs), 5, "SOURCE.reference_count", "reference_images")
        self.equal({x["id"] for x in refs}, {"home", "play", "result", "handbook", "upgrades"},
                   "SOURCE.reference_ids", "reference_images")
        for ref in refs:
            p = "reference_images." + ref["id"]
            self.equal(ref["status"], "reference_only", "SOURCE.reference_status", p)
            self.equal(ref["path"], "../visuals/" + ref["id"] + ".png", "SOURCE.reference_path", p)
            info = self.context["reference_pngs"].get(ref["id"], {})
            self.check(info.get("valid_png", False), "SOURCE.reference_png", p,
                       info, "有効なPNGヘッダーと正の寸法")
        self.metrics["reference_screen_images"] = len(refs)

    def achievements(self):
        a = self.docs["achievement_catalog"]
        achievements, families, rewards = a["achievements"], a["families"], a["rewards"]
        rows = []
        family_headings = {}
        for line in self.context["game_experience"].splitlines():
            if re.match(r"^\|\s*[A-L]\d{2}\s*\|", line):
                cells = [x.strip() for x in line.strip().strip("|").split("|")]
                self.equal(len(cells), 4, "ACH.source_row_shape", cells[0])
                if len(cells) == 4:
                    scope = cells[3]
                    rows.append({"id": cells[0], "name": cells[1], "condition": cells[2],
                                 "scope": scope.replace("隠し", "").strip(), "hidden": "隠し" in scope})
            match = re.match(r"^### ([A-L]) (.+)$", line)
            if match:
                family_headings[match[1]] = match[2]
        expected_ids = {f"{f}{n:02d}" for f in "ABCDEFGHIJKL" for n in range(1, 7)}
        self.equal(len(rows), 72, "ACH.source_count", "game_experience.md")
        self.unique([x["id"] for x in rows], "ACH.source_duplicate", "game_experience.md")
        self.equal({x["id"] for x in rows}, expected_ids, "ACH.source_ids", "game_experience.md")
        self.equal(len(achievements), 72, "ACH.count", "achievements")
        self.equal(a["achievement_count"], len(achievements), "ACH.declared_count", "achievement_count")
        self.equal({x["id"] for x in achievements}, expected_ids, "ACH.ids", "achievements")
        for key in ["id", "name", "title_id", "stamp_asset_id"]:
            self.unique([x[key] for x in achievements], "ACH.unique_" + key, "achievements")
        by_source = {x["id"]: x for x in rows}
        for item in achievements:
            path = "achievements." + item["id"]
            source = by_source.get(item["id"], {})
            for key in ["id", "name", "condition", "scope", "hidden"]:
                self.equal(item.get(key), source.get(key), "ACH.source_match", path + "." + key)
            self.check(type(item["hidden"]) is bool, "ACH.hidden_type", path)
            self.equal(item["family_id"], item["id"][0], "ACH.family", path)
            self.equal(item["stamp_asset_id"], "stamp_" + item["id"].lower(), "ACH.stamp", path)
            self.equal(item["title_id"], "title_" + item["id"].lower(), "ACH.title", path)
            self.equal(item["asset_refs"], [item["stamp_asset_id"], "family_" + item["family_id"].lower()],
                       "ACH.asset_refs", path)
            self.texts(item, ["confirm_event", "reset_policy", "visual_motif", "visual_differentiator"],
                       "ACH.required_text", path)
            self.check(isinstance(item["progress_fields"], list) and bool(item["progress_fields"]),
                       "ACH.progress", path)
            self.unique([p["key"] for p in item["progress_fields"]], "ACH.progress_keys", path)
            for i, progress in enumerate(item["progress_fields"]):
                pp = f"{path}.progress_fields[{i}]"
                self.texts(progress, ["key", "label", "current", "display"], "ACH.progress_text", pp)
                self.check(isinstance(progress.get("unit"), str), "ACH.progress_unit", pp,
                           progress.get("unit"), "数値単位または状態表示の空文字列")
                self.check("target" in progress and (progress["target"] is not None or "{target}" not in progress["display"]),
                           "ACH.progress_target", pp, progress.get("target"), "目標値、または目標プレースホルダーのない記録表示")
                district_ids = {d["id"] for d in self.docs["economy_config"]["districts"]}
                if progress["key"].startswith("district_") and progress["key"].endswith("_stage"):
                    self.equal(progress.get("district_id"), progress["key"][9:-6], "ACH.progress_district_key", pp)
                if "district_id" in progress:
                    self.check(progress["district_id"] in district_ids, "ACH.progress_district", pp,
                               progress["district_id"], sorted(district_ids))
                if "district_ids" in progress:
                    self.equal(set(progress["district_ids"]), district_ids, "ACH.progress_districts", pp)
            if item["id"] == "F03":
                self.equal({p["key"]: p.get("input_tag_id") for p in item["progress_fields"] if p["key"].startswith("element_")},
                           {"element_n": "n", "element_sokuon": "sokuon", "element_youon": "yoon", "element_choon": "long_mark"},
                           "ACH.f03_input_tags", path)
            self.check(nonempty(item["hidden_hint"]) if item["hidden"] else item["hidden_hint"] is None,
                       "ACH.hidden_hint", path)
        self.equal({x["id"] for x in achievements if x["hidden"]}, {"B05", "F06"},
                   "ACH.hidden_set", "achievements")
        self.equal(len(families), 12, "ACH.family_count", "families")
        self.equal({x["id"] for x in families}, set("ABCDEFGHIJKL"), "ACH.family_ids", "families")
        self.unique([x["id"] for x in families], "ACH.family_duplicate", "families")
        for family in families:
            fid = family["id"]
            self.equal(family["name"], family_headings.get(fid), "ACH.family_name", fid)
            self.equal(sum(x["family_id"] == fid for x in achievements), 6, "ACH.family_six", fid)
            self.texts(family, ["emblem_motif", "postcard_brief", "postcard_name", "foil_board_name"],
                       "ACH.family_text", fid)
        self.equal(len(rewards), 40, "REWARD.count", "rewards")
        self.unique([x["id"] for x in rewards], "REWARD.duplicate", "rewards")
        family_rewards = [x for x in rewards if x["id"].startswith("reward_family_")]
        milestones = [x for x in rewards if not x["id"].startswith("reward_family_")]
        self.equal(len(family_rewards), 24, "REWARD.family_count", "rewards")
        self.equal(len(milestones), 16, "REWARD.milestone_count", "rewards")
        rewards_by_id = {x["id"]: x for x in rewards}
        for f in families:
            for suffix, target, kind, refs, name in [
                ("postcard", 3, "postcard", [f["postcard_asset_id"]], f["postcard_name"]),
                ("foil_board", 6, "foil_board", ["board_base", "board_foil", f["emblem_asset_id"]], f["foil_board_name"]),
            ]:
                rid = "reward_family_" + f["id"].lower() + "_" + suffix
                rw = rewards_by_id.get(rid, {})
                for key, value in {"kind": kind, "trigger": f'{f["id"]}系統の実績を{target}件解除',
                                   "asset_refs": refs, "name": name}.items():
                    self.equal(rw.get(key), value, "REWARD.family_contract", rid + "." + key)
        expected_milestones = {
            "total_08_frame": ("解除総数8件", "frame"),
            "total_08_ornament": ("解除総数8件", "ornament"),
            "total_16_frame": ("解除総数16件", "frame"),
            "total_16_ornament": ("解除総数16件", "ornament"),
            "total_24_album": ("解除総数24件", "album"),
            "total_24_postcard": ("解除総数24件", "postcard"),
            "total_24_thanks": ("解除総数24件", "dom_text"),
            "total_36_background": ("解除総数36件", "home_panel"),
            "total_36_frame": ("解除総数36件", "frame"),
            "total_48_board": ("解除総数48件", "memorial_board"),
            "first_collection_board": ("A〜H全48件の解除", "memorial_board"),
            "first_collection_stamp": ("A〜H全48件の解除", "memorial_stamp"),
            "total_60_frame": ("解除総数60件", "frame"),
            "total_60_album": ("解除総数60件", "album"),
            "complete_72_board": ("全72件の解除", "memorial_board"),
            "complete_72_stamp": ("全72件の解除", "memorial_stamp"),
        }
        self.equal({x["id"] for x in milestones}, {"reward_" + x for x in expected_milestones},
                   "REWARD.milestone_ids", "rewards")
        for rid, (trigger, kind) in expected_milestones.items():
            rw = rewards_by_id.get("reward_" + rid, {})
            self.equal(rw.get("trigger"), trigger, "REWARD.trigger", rid)
            self.equal(rw.get("kind"), kind, "REWARD.kind", rid)
        for rw in rewards:
            self.texts(rw, ["name", "trigger", "visual_brief", "placement"], "REWARD.text", rw["id"])
            self.equal(rw["effect"], "cosmetic_only", "REWARD.effect", rw["id"])
            self.check(bool(rw["asset_refs"]) if rw["kind"] != "dom_text" else not rw["asset_refs"],
                       "REWARD.assets_or_dom", rw["id"])
        memorials = [x for x in rewards if x["kind"] == "memorial_stamp"]
        self.equal(len(memorials), 2, "REWARD.memorial_count", "rewards")
        self.check(not ({z for x in memorials for z in x["asset_refs"]} &
                        {x["stamp_asset_id"] for x in achievements}),
                   "REWARD.memorial_not_achievement", "rewards")
        self.metrics.update({"achievements": len(achievements), "families": len(families),
                             "titles": len({x["title_id"] for x in achievements}),
                             "progress_fields": sum(len(x["progress_fields"]) for x in achievements),
                             "additional_rewards": len(rewards), "family_rewards": len(family_rewards),
                             "milestone_rewards": len(milestones), "memorial_stamps_outside_72": len(memorials)})

    def city(self):
        c, ec = self.docs["city_catalog"], self.docs["economy_config"]
        districts = c["districts"]
        economics = {x["id"]: x for x in ec["districts"]}
        stages = {x["stage"]: x for x in ec["development"]["stages"]}
        micro = rational(ec["arithmetic"]["micro_unit"])
        self.equal(len(districts), 6, "CITY.count", "districts")
        self.unique([d["id"] for d in districts], "CITY.duplicate", "districts")
        self.equal({d["id"] for d in districts}, set(economics), "CITY.ids", "districts")
        completed, empty = [], []
        for d in districts:
            did, e = d["id"], economics[d["id"]]
            for key, source in [("name", "name"), ("factor", "cost_multiplier"),
                                ("opening_stage_sum", "unlock_stage_sum"), ("opening_coins", "unlock_coins")]:
                self.equal(d[key], e[source], "CITY." + key, did)
            self.numeric(d["base_shop_income"], rational(e["shop_base_income_per_second_micro"]) / micro,
                         "CITY.base_income", did)
            self.equal(d["icon_asset_id"], "district_" + did, "CITY.icon", did)
            self.equal(d["shop_asset_id"], "shop_" + did, "CITY.shop", did)
            self.texts(d, ["icon_motif", "shop_brief"], "CITY.text", did)
            self.equal([x["stage"] for x in d["stage_entries"]], list(range(6)), "CITY.stage_set", did)
            costs = {x["target_stage"]: x for x in e["development_costs"]}
            for s in d["stage_entries"]:
                n, p = s["stage"], f'{did}.s{s["stage"]}'
                expected_material = rational(costs[n]["materials_micro"]) / micro if n else 0
                expected_coins = rational(costs[n]["coins_micro"]) / micro if n else 0
                self.numeric(s["material_cost"], expected_material, "CITY.stage.material_cost", p)
                self.numeric(s["coin_cost"], expected_coins, "CITY.stage.coin_cost", p)
                self.equal(s["shop_cap"], stages[n]["shop_cap"] if n else 0, "CITY.stage.shop_cap", p)
                if n:
                    for cat, key in [("material_cost", "base_materials_micro"), ("coin_cost", "base_coins_micro")]:
                        self.numeric(s[cat], rational(stages[n][key]) * e["cost_multiplier"] / micro,
                                     "CITY.stage.base_formula", p + "." + cat)
                art = f"city_{did}_s{n}" if n else "city_plot_empty"
                self.equal(s["building_asset_id"], art, "CITY.stage.asset", p)
                self.equal(s["asset_refs"], [art, d["icon_asset_id"]] + ([d["shop_asset_id"]] if n else []),
                           "CITY.stage.refs", p)
                (completed if n else empty).append(s["building_asset_id"])
                self.texts(s, ["stage_name", "main_building", "changed_from_previous", "recognition_cue"],
                           "CITY.stage.text", p)
                for key in ["secondary_elements", "composition_notes"]:
                    self.check(bool(s[key]) and all(nonempty(x) for x in s[key]), "CITY.stage.notes", p + "." + key)
        self.equal(len(set(completed)), 30, "CITY.completed_art_count", "districts")
        self.equal(set(empty), {"city_plot_empty"}, "CITY.shared_empty", "districts")
        landscapes = c["landscapes"]
        self.equal(len(landscapes), 3, "CITY.landscape_count", "landscapes")
        self.equal([x["id"] for x in landscapes], ec["new_city"]["landscapes"], "CITY.landscape_ids", "landscapes")
        self.unique([x["asset_id"] for x in landscapes], "CITY.landscape.asset_unique", "landscapes")
        for landscape in landscapes:
            self.equal(landscape["asset_id"], "terrain_" + landscape["id"], "CITY.landscape.asset", landscape["id"])
            self.texts(landscape, ["name", "visual_brief", "common_landmarks_policy"], "CITY.landscape.text", landscape["id"])
            self.check(not ({"anchors", "routes", "map_layout", "district_asset_overrides", "water_boundary"} & set(landscape)),
                       "CITY.landscape.shared_geometry", landscape["id"])
        self.equal(ec["new_city"]["landscape_changes_economy"], False, "CITY.landscape.economy", "new_city")
        self.metrics.update({"districts": len(districts), "district_stage_states": len(completed) + len(empty),
                             "district_completed_art": len(set(completed)), "shared_empty_art": len(set(empty)),
                             "landscapes": len(landscapes), "landscape_stage_combinations": (len(completed) + len(empty)) * len(landscapes)})

    def equipment(self):
        e, ec = self.docs["equipment_catalog"], self.docs["economy_config"]
        eq, prices = ec["equipment"], ec["price_tables"]
        districts = {x["id"]: x for x in ec["districts"]}
        milestones = eq["milestones"]
        self.equal(milestones, [10, 25, 50], "EQUIP.milestones", "economy_config.equipment")
        self.equal(e["rules"]["milestones"], milestones, "EQUIP.milestones", "equipment_catalog.rules")
        multiplier = lambda n: eq["milestone_factor"] ** sum(n >= k for k in milestones)
        tier = lambda n: 0 if n == 0 else 1 + sum(n >= k for k in milestones)
        formula_cells = Counter()
        table_cells = Counter()
        paid_cells = 0
        reference_cells = 0

        def check_price(value, kind, n, did=None):
            nonlocal paid_cells, reference_cells
            spec = eq[kind]["price"]
            factor = districts[did]["cost_multiplier"] if did else 1
            formula = ceil_fraction(rational(spec["base_coins"]) * factor *
                                    Fraction(spec["growth_numerator"], spec["growth_denominator"]) **
                                    (n + spec["exponent_offset"]))
            if kind == "packaging":
                canonical = prices["packaging_by_current_level"][n]
            elif kind == "crews":
                canonical = prices["crews_by_district_current_1_to_49"][did][n - 1]
            else:
                canonical = prices["shops_by_district_current_0_to_49"][did][n]
            path = f"{kind}.{did + '.' if did else ''}{n}"
            self.check(type(value) is int, "PRICE.integer", path, value, "整数")
            self.equal(value, formula, "PRICE.formula", path)
            self.equal(value, canonical, "PRICE.canonical", path)
            self.equal(canonical, formula, "PRICE.canonical_formula", path)
            formula_cells[kind] += 1
            table_cells[kind] += 1
            if kind == "shops" and n == 0:
                reference_cells += 1
            else:
                paid_cells += 1

        self.equal([x["level"] for x in e["packaging_levels"]], list(range(51)), "EQUIP.packaging.range", "packaging_levels")
        visual_names = ["手包みの敷き布", "木の荷づくり台", "荷札機つきの台", "二列の仕分け台", "一体型の荷づくり工房"]
        pm = eq["packaging"]["material_multiplier"]
        self.equal(len(prices["packaging_by_current_level"]), 50, "PRICE.table_size", "packaging")
        for item in e["packaging_levels"]:
            n = item["level"]
            expected = Fraction(pm["base_numerator"] + pm["level_numerator"] * n, pm["denominator"]) * multiplier(n)
            self.numeric(item["multiplier"], expected, "EQUIP.packaging.multiplier", str(n))
            self.equal(item["visual_tier"], tier(n), "EQUIP.packaging.visual", str(n))
            self.equal(item["visual_name"], visual_names[tier(n)], "EQUIP.packaging.visual_name", str(n))
            self.equal(item["asset_refs"], [f"equipment_packaging_{tier(n)}", "equipment_packaging_icon"],
                       "EQUIP.packaging.assets", str(n))
            self.equal(item["next_milestone"], next((x for x in [1] + milestones if x > n), None),
                       "EQUIP.packaging.next_milestone", str(n))
            if n < eq["packaging"]["maximum"]:
                check_price(item["next_price"], "packaging", n)
            else:
                self.equal(item["next_price"], None, "EQUIP.packaging.cap", str(n))
        self.equal([x["count"] for x in e["crew_levels"]], list(range(1, 51)), "EQUIP.crew.range", "crew_levels")
        vehicle = {1: "cart", 2: "van", 3: "box_van", 4: "truck"}
        train = ["vehicle_train_front", "vehicle_train_rear", "city_freight_terminal"]
        for did in districts:
            self.equal(len(prices["crews_by_district_current_1_to_49"][did]), 49, "PRICE.table_size", "crews." + did)
            self.equal(len(prices["shops_by_district_current_0_to_49"][did]), 50, "PRICE.table_size", "shops." + did)
        for item in e["crew_levels"]:
            n = item["count"]
            self.numeric(item["base_capacity_per_second"], eq["crews"]["base_material_per_crew_second"] * n * multiplier(n),
                         "EQUIP.crew.capacity", str(n))
            self.equal(item["visual_tier"], tier(n), "EQUIP.crew.visual", str(n))
            self.equal(item["road_vehicle"], vehicle[tier(n)], "EQUIP.crew.vehicle", str(n))
            self.equal(item["asset_refs"], [f"vehicle_{vehicle[tier(n)]}_{direction}" for direction in ["front", "rear"]] + ["equipment_crews_icon"],
                       "EQUIP.crew.assets", str(n))
            self.equal(item["railway_override_assets"], train, "EQUIP.crew.railway_override", str(n))
            self.equal(set(item["next_price_by_district"]), set(districts), "PRICE.districts", "crews." + str(n))
            for did, value in item["next_price_by_district"].items():
                if n < eq["crews"]["maximum"]:
                    check_price(value, "crews", n, did)
                else:
                    self.equal(value, None, "EQUIP.crew.cap", did)
        self.equal([x["count"] for x in e["shop_levels"]], list(range(51)), "EQUIP.shop.range", "shop_levels")
        caps = {0: 0, **{x["stage"]: x["shop_cap"] for x in ec["development"]["stages"]}}
        for item in e["shop_levels"]:
            n = item["count"]
            self.numeric(item["income_count_factor"], n * multiplier(n), "EQUIP.shop.income", str(n))
            self.equal(item["minimum_stage"], min(s for s, cap in caps.items() if cap >= n), "EQUIP.shop.minimum_stage", str(n))
            self.equal(item["visual_tier"], tier(n), "EQUIP.shop.visual", str(n))
            overlay = [aid for limit, aid in [(10, "shop_canopy"), (25, "shop_banner"), (50, "shop_signboard")] if n >= limit]
            self.equal(item["overlay_asset_refs"], overlay, "EQUIP.shop.overlays", str(n))
            self.equal(item["asset_refs"], ["equipment_shops_icon"] + overlay, "EQUIP.shop.assets", str(n))
            self.equal(item["base_asset_by_district"], {did: "shop_" + did for did in districts}, "EQUIP.shop.base_assets", str(n))
            self.equal(item["paid_purchase_reachable"], 0 < n < 50, "EQUIP.shop.paid", str(n))
            self.check(type(item["paid_purchase_reachable"]) is bool, "EQUIP.shop.paid_type", str(n))
            self.check(nonempty(item["zero_price_cell_role"]) if n == 0 else item["zero_price_cell_role"] is None,
                       "EQUIP.shop.reference_role", str(n))
            self.equal(set(item["next_price_by_district"]), set(districts), "PRICE.districts", "shops." + str(n))
            for did, value in item["next_price_by_district"].items():
                if n < eq["shops"]["maximum"]:
                    check_price(value, "shops", n, did)
                else:
                    self.equal(value, None, "EQUIP.shop.cap", did)
        self.equal(ec["development"]["free_shops_at_stage_one"], 1, "EQUIP.shop.free_one", "development")
        for rule in ["shops_zero_is_not_paid_purchase", "visual_tiers_are_not_new_equipment_types",
                     "shops_minimum_stage_and_current_capacity_both_required", "railway_overrides_road_vehicle"]:
            self.equal(e["rules"][rule], True, "EQUIP.rule", rule)
        self.equal(sum(formula_cells.values()), 644, "PRICE.count", "prices")
        self.equal(paid_cells, 638, "PRICE.paid_count", "prices")
        self.equal(reference_cells, 6, "PRICE.reference_count", "prices")
        self.equal(e["rules"]["total_price_cells"], sum(formula_cells.values()), "PRICE.declared_count", "rules")
        self.equal(e["rules"]["reachable_paid_price_cells"], paid_cells, "PRICE.declared_paid", "rules")
        rail = ec["railway"]
        self.equal(len(e["railways"]), 6, "RAILWAY.count", "railways")
        self.equal({x["district_id"] for x in e["railways"]}, set(districts), "RAILWAY.districts", "railways")
        for item in e["railways"]:
            did = item["district_id"]
            factor = districts[did]["cost_multiplier"]
            for key, value in {
                "id": "railway_" + did, "name": districts[did]["name"] + "の貨物鉄道",
                "required_stage": rail["minimum_stage"], "required_crews": rail["minimum_crews"],
                "coins": rail["base_coins"] * factor, "transport_multiplier": rail["transport_factor"],
                "states": ["unbuilt", "built"], "route_geometry_id": "route_" + did,
                "asset_refs": ["equipment_railway_icon"] + train,
            }.items():
                self.equal(item[key], value, "RAILWAY." + key, item["id"])
            self.numeric(item["free_stock_materials"], rational(rail["base_materials_micro"]) * factor /
                         rational(ec["arithmetic"]["micro_unit"]), "RAILWAY.materials", item["id"])
        self.equal(len(e["synergies"]), 3, "SYNERGY.count", "synergies")
        self.equal({x["id"] for x in e["synergies"]}, {x["id"] for x in ec["synergies"]}, "SYNERGY.ids", "synergies")
        synergy_map = {x["id"]: x for x in ec["synergies"]}
        for item in e["synergies"]:
            for key in ["id", "name", "cost_coins", "requires", "effect"]:
                self.equal(item[key], synergy_map[item["id"]][key], "SYNERGY." + key, item["id"])
            self.equal(item["asset_refs"], ["synergy_" + item["id"]], "SYNERGY.assets", item["id"])
            self.equal(item["states"], ["unowned", "owned"], "SYNERGY.states", item["id"])
        research = ec["research"]
        types = {x["id"]: x for x in research["types"]}
        self.equal(len(e["research_ranks"]), 18, "RESEARCH.count", "research_ranks")
        self.equal({(x["type_id"], x["rank"]) for x in e["research_ranks"]},
                   {(tid, n) for tid in types for n in range(6)}, "RESEARCH.states", "research_ranks")
        self.unique([x["id"] for x in e["research_ranks"]], "RESEARCH.duplicate", "research_ranks")
        for item in e["research_ranks"]:
            n, tid = item["rank"], item["type_id"]
            self.equal(item["id"], f"research_{tid}_r{n}", "RESEARCH.id", item["id"])
            self.equal(item["name"], types[tid]["name"], "RESEARCH.name", item["id"])
            rm = research["multiplier"]
            self.numeric(item["multiplier"], Fraction(rm["base_numerator"] + rm["rank_numerator"] * n, rm["denominator"]),
                         "RESEARCH.multiplier", item["id"])
            self.equal(item["next_blueprints"], research["next_rank_cost_blueprints"][n] if n < 5 else None,
                       "RESEARCH.next_cost", item["id"])
            self.equal(item["total_blueprints"], sum(research["next_rank_cost_blueprints"][:n]), "RESEARCH.total_cost", item["id"])
            self.equal(item["asset_refs"], ["research_" + tid], "RESEARCH.assets", item["id"])
            self.texts(item, ["rank_visual", "reset"], "RESEARCH.text", item["id"])
        self.metrics.update({"packaging_states": len(e["packaging_levels"]), "crew_states_per_route": len(e["crew_levels"]),
                             "shop_states_per_district": len(e["shop_levels"]), "price_cells": sum(formula_cells.values()),
                             "price_cells_by_kind": dict(formula_cells), "formula_price_checks": sum(formula_cells.values()),
                             "canonical_price_checks": sum(table_cells.values()), "reachable_paid_price_cells": paid_cells,
                             "reference_only_zero_shop_price_cells": reference_cells,
                             "railways": len(e["railways"]), "synergies": len(e["synergies"]),
                             "research_states": len(e["research_ranks"])})

    def manifest(self):
        m = self.docs["visual_resource_manifest"]
        assets, profiles = m["assets"], m["profiles"]
        self.equal(m["status"], "specification_complete_assets_planned", "MANIFEST.status", "manifest")
        self.equal(len(assets), 248, "MANIFEST.asset_count", "assets")
        self.unique([a["id"] for a in assets], "MANIFEST.duplicate_id", "assets")
        kinds = Counter(a["kind"] for a in assets)
        categories = Counter(a["category"] for a in assets)
        phases = Counter(a["production_phase"] for a in assets)
        self.equal(dict(kinds), {"raster": 149, "svg": 92, "audio": 7}, "MANIFEST.kind_counts", "assets")
        self.equal(dict(categories), CATEGORY_COUNTS, "MANIFEST.category_counts", "assets")
        self.equal(m["counts"]["by_category"], dict(categories), "MANIFEST.declared_categories", "counts")
        self.equal(m["counts"]["by_phase"], dict(phases), "MANIFEST.declared_phases", "counts")
        computed = {"visual_unique": kinds["raster"] + kinds["svg"], "raster_unique": kinds["raster"],
                    "svg_unique": kinds["svg"], "audio_unique": kinds["audio"], "all_unique": len(assets),
                    "runtime_export_files": sum(len(a["runtime_exports"]) for a in assets),
                    "reference_screen_images": len(m["reference_images"]), "bindings": len(m["bindings"])}
        for key, value in computed.items():
            self.equal(m["counts"][key], value, "MANIFEST.declared_count", key)
        self.equal(computed["runtime_export_files"], 249, "MANIFEST.export_count", "assets")
        self.equal(m["counts"]["production_assets_delivered"], 0, "MANIFEST.delivered", "counts")
        self.equal(set(profiles), set(PROFILE_CONTRACTS), "PROFILE.ids", "profiles")
        for pid, profile in profiles.items():
            contract = PROFILE_CONTRACTS[pid]
            for key, expected in zip(["source_size", "transparent", "anchor"], contract):
                self.equal(profile[key], expected, "PROFILE." + key, pid)
            self.texts(profile, ["layer", "notes"], "PROFILE.text", pid)
            for key in ["display_css", "minimum_css", "safe_rect"]:
                self.check(key in profile and (profile[key] is not None if pid != "audio" else profile[key] is None),
                           "PROFILE.dimension_contract", pid + "." + key)
        exports = []
        asset_map = {a["id"]: a for a in assets}
        for a in assets:
            aid = a["id"]
            self.check(bool(re.fullmatch(r"[a-z][a-z0-9_]*", aid)), "MANIFEST.id_format", aid)
            self.texts(a, ["name", "visual_brief", "reuse_policy", "release_requirement"], "MANIFEST.text", aid)
            self.equal(a["status"], "planned", "MANIFEST.asset_status", aid)
            self.check(a["production_phase"] in {"P0", "P1", "P2"}, "MANIFEST.phase", aid)
            expected_kind = "audio" if a["category"] in {"bgm", "sound_effect"} else "raster" if a["category"] in RASTER_CATEGORIES else "svg"
            self.equal(a["kind"], expected_kind, "MANIFEST.category_kind", aid)
            self.check(a["profile_id"] in profiles, "PROFILE.reference", aid, a["profile_id"], sorted(profiles))
            if a["profile_id"] not in profiles:
                continue
            profile = profiles[a["profile_id"]]
            expected_layer = profile["layer"]
            if a["category"] == "construction":
                expected_layer = "scaffold"
            elif a["category"] == "shop_overlay":
                expected_layer = "shop_overlay"
            elif aid in {"board_base", "album_base"}:
                expected_layer = "collection_base"
            elif aid == "board_foil":
                expected_layer = "collection_finish"
            elif a["profile_id"] == "frame" and a["category"] == "milestone_svg":
                expected_layer = "collection_outer_frame"
            self.equal(a.get("render_layer"), expected_layer, "MANIFEST.render_layer", aid)
            if a["category"] == "vehicle":
                direction = "front" if aid.endswith("_front") else "rear" if aid.endswith("_rear") else None
                self.check(direction is not None, "MANIFEST.vehicle_direction_id", aid)
                self.equal(a.get("native_direction_map"), [2, 1] if direction == "front" else [2, -1],
                           "MANIFEST.vehicle_native_direction", aid)
                self.equal(a.get("native_direction_map"), self.docs["rendering_rules"]["route"]["direction_vectors"].get(direction),
                           "MANIFEST.vehicle_direction_rule", aid)
            size = a["source_size"]
            if a["kind"] == "audio":
                self.equal(size, None, "PROFILE.audio_size", aid)
                self.equal(a["profile_id"], "audio", "PROFILE.audio_profile", aid)
                self.check(rational(a["duration_seconds"]) > 0, "MANIFEST.audio_duration", aid)
                anchor, safe = None, None
            else:
                self.check(isinstance(size, list) and len(size) == 2 and all(type(n) is int and n > 0 for n in size),
                           "PROFILE.source_dimensions", aid, size, "正の整数の幅・高さ")
                if isinstance(profile["source_size"], list):
                    self.equal(size, profile["source_size"], "PROFILE.size_match", aid)
                else:
                    self.equal(a["kind"], "svg", "PROFILE.viewbox_kind", aid)
                    self.equal(profile["source_size"], "viewBoxに従う", "PROFILE.viewbox_resolution", aid)
                anchor = [rational(n) / 2 for n in size] if profile["anchor"] == "中央" else [rational(n) for n in profile["anchor"]]
                safe = [rational(size[0]) * Fraction(2, 25), rational(size[1]) * Fraction(2, 25),
                        rational(size[0]) * Fraction(23, 25), rational(size[1]) * Fraction(23, 25)] if isinstance(profile["safe_rect"], str) else [rational(n) for n in profile["safe_rect"]]
                self.check(len(anchor) == 2 and all(0 <= anchor[i] <= size[i] for i in range(2)), "PROFILE.anchor_bounds", aid)
                self.check(len(safe) == 4 and 0 <= safe[0] < safe[2] <= size[0] and 0 <= safe[1] < safe[3] <= size[1],
                           "PROFILE.safe_rect", aid)
                self.check(type(profile["transparent"]) is bool, "PROFILE.alpha_type", aid)
                for key in ["display_css", "minimum_css"]:
                    dim = profile[key]
                    self.check(isinstance(dim, list) and len(dim) == 2 and all(rational(n) > 0 for n in dim),
                               "PROFILE.display_dimensions", aid + "." + key)
                    self.numeric(rational(dim[0]) / rational(dim[1]), rational(size[0]) / rational(size[1]),
                                 "PROFILE.aspect_ratio", aid + "." + key)
                self.check(all(profile["minimum_css"][i] <= profile["display_css"][i] for i in range(2)),
                           "PROFILE.minimum_size", aid)
            self.check(bool(a["placements"]) and set(a["placements"]) <= SCREENS, "MANIFEST.placements", aid,
                       a["placements"], sorted(SCREENS))
            self.unique(a["placements"], "MANIFEST.placement_duplicate", aid)
            self.equal(a["source_master_format"], {"raster": "PNG", "svg": "SVG", "audio": "WAV"}[a["kind"]],
                       "MANIFEST.master_format", aid)
            suffixes = ["webp"] if a["kind"] == "raster" else ["svg"] if a["kind"] == "svg" else ["ogg", "mp3"] if a["category"] == "bgm" else ["wav"]
            expected_exports = [f'assets/{a["category"]}/{aid}.{suffix}' for suffix in suffixes]
            self.equal(a["runtime_exports"], expected_exports, "MANIFEST.export_paths", aid)
            for export in a["runtime_exports"]:
                self.check(not PurePosixPath(export).is_absolute() and ".." not in PurePosixPath(export).parts,
                           "MANIFEST.safe_export_path", aid)
            exports.extend(a["runtime_exports"])
            self.resolved_assets.append({"id": aid, "kind": a["kind"], "profile_id": a["profile_id"],
                                         "render_layer": a.get("render_layer"),
                                         "native_direction_map": a.get("native_direction_map"),
                                         "source_size": size, "transparent": profile["transparent"],
                                         "anchor": [str(n) for n in anchor] if anchor is not None else None,
                                         "safe_rect": [str(n) for n in safe] if safe is not None else None,
                                         "placements": a["placements"], "runtime_exports": a["runtime_exports"],
                                         "status": a["status"]})
        self.unique(exports, "MANIFEST.export_duplicate", "runtime_exports")
        for catalog_name, expected_size in [("achievement_catalog", 111), ("equipment_catalog", 29)]:
            local_assets = self.docs[catalog_name]["assets"]
            self.equal(len(local_assets), expected_size, "MANIFEST.local_asset_count", catalog_name)
            self.unique([x["id"] for x in local_assets], "MANIFEST.local_duplicate", catalog_name)
            for local in local_assets:
                main = asset_map.get(local["id"], {})
                for key, value in local.items():
                    manifest_key = "visual_brief" if key == "motif" else key
                    self.equal(value, main.get(manifest_key), "MANIFEST.local_asset_match", catalog_name + "." + local["id"] + "." + key)
        self.metrics.update(computed)
        self.metrics.update({"asset_profiles": len(profiles), "resolved_asset_profiles": len(self.resolved_assets),
                             "resolved_render_layers": len(self.resolved_assets),
                             "vehicle_native_directions": sum(a["category"] == "vehicle" for a in assets),
                             "production_assets_delivered": sum(a["status"] == "delivered" for a in assets),
                             "production_asset_status_counts": dict(Counter(a["status"] for a in assets)),
                             "assets_by_category": dict(categories),
                             "assets_by_phase": dict(phases)})

    def references(self):
        a, c, e, r, m = (self.docs[name] for name in DATA_NAMES[:5])
        assets = {x["id"]: x for x in m["assets"]}
        expected = {}

        def bind(bid, kind, refs):
            expected[bid] = {"id": bid, "kind": kind, "asset_refs": refs}

        for item in a["achievements"]:
            bind("achievement:" + item["id"], "achievement", item["asset_refs"] + ["stamp_frame"])
        for f in a["families"]:
            bind("family:" + f["id"], "family", [f["emblem_asset_id"], f["postcard_asset_id"], "board_base", "board_foil"] +
                 [x["stamp_asset_id"] for x in a["achievements"] if x["family_id"] == f["id"]])
        for item in a["rewards"]:
            bind("reward:" + item["id"], "reward", item["asset_refs"])
        for district in c["districts"]:
            for stage in district["stage_entries"]:
                bind(f'district:{district["id"]}:s{stage["stage"]}', "district", stage["asset_refs"])
        for landscape in c["landscapes"]:
            bind("landscape:" + landscape["id"], "landscape", [landscape["asset_id"]])
        for item in e["packaging_levels"]:
            bind("packaging:" + str(item["level"]), "equipment", item["asset_refs"])
        for item in e["crew_levels"]:
            bind(f'crews:{item["count"]}:road', "equipment", item["asset_refs"])
            if item["count"] >= self.docs["economy_config"]["railway"]["minimum_crews"]:
                bind(f'crews:{item["count"]}:railway', "equipment", item["railway_override_assets"] + ["equipment_crews_icon"])
        for item in e["shop_levels"]:
            for district in c["districts"]:
                did = district["id"]
                bind(f'shops:{did}:{item["count"]}', "equipment", item["asset_refs"] +
                     ([item["base_asset_by_district"][did]] if item["count"] > 0 else []))
        for item in e["railways"]:
            bind(item["id"], "equipment", item["asset_refs"])
        for item in e["synergies"]:
            bind("synergy:" + item["id"], "equipment", item["asset_refs"])
        for item in e["research_ranks"]:
            bind(item["id"], "equipment", item["asset_refs"])
        for aid in COMPONENT_IDS:
            bind("component:" + aid, "component", [aid])
        for size in ["small", "medium", "large"]:
            bind("construction:" + size, "render_state", ["scaffold_" + size, "ui_plan", "ui_pause"])
        for district in c["districts"]:
            bind("route:" + district["id"], "render_state", ["ui_route", "city_freight_terminal", "vehicle_train_front", "vehicle_train_rear"])
        bindings = m["bindings"]
        self.equal(len(bindings), 709, "REFERENCE.binding_count", "bindings")
        self.unique([x["id"] for x in bindings], "REFERENCE.binding_duplicate", "bindings")
        self.equal({x["id"] for x in bindings}, set(expected), "REFERENCE.binding_ids", "bindings")
        reverse = defaultdict(set)
        for binding in bindings:
            bid = binding["id"]
            self.equal(binding, expected.get(bid), "REFERENCE.binding_contract", bid)
            self.unique(binding["asset_refs"], "REFERENCE.binding_ref_duplicate", bid)
            for aid in binding["asset_refs"]:
                self.check(aid in assets, "REFERENCE.binding_unknown", bid, aid, "台帳内の資材ID")
                reverse[aid].add(bid)
        reverse_count = 0
        for aid, asset in assets.items():
            self.unique(asset["used_by"], "REFERENCE.reverse_duplicate", aid)
            self.equal(set(asset["used_by"]), reverse[aid], "REFERENCE.reverse", aid)
            self.check(bool(reverse[aid]), "REFERENCE.orphan", aid, sorted(reverse[aid]), "1件以上の利用先")
            for bid in asset["used_by"]:
                self.check(bid in expected, "REFERENCE.reverse_unknown", aid, bid, "既知の利用先ID")
            reverse_count += len(asset["used_by"])
        self.equal(set(assets), {aid for binding in expected.values() for aid in binding["asset_refs"]},
                   "REFERENCE.complete_asset_set", "assets")
        occurrences = []

        def walk(value, path):
            if isinstance(value, dict):
                for key, child in value.items():
                    cp = path + "." + key
                    if (key.endswith("_asset_id") or key == "asset_id") and isinstance(child, str):
                        occurrences.append((cp, child))
                    elif key in {"asset_refs", "overlay_asset_refs", "railway_override_assets", "assets", "asset_ids"} and isinstance(child, list) and all(isinstance(x, str) for x in child):
                        occurrences.extend((cp, x) for x in child)
                    elif key in {"base_asset_by_district", "scaffold_by_target_stage"} and isinstance(child, dict):
                        occurrences.extend((cp + "." + k, v) for k, v in child.items())
                    elif key == "overlay_anchors" and isinstance(child, dict):
                        occurrences.extend((cp, k) for k in child)
                    else:
                        walk(child, cp)
            elif isinstance(value, list):
                for index, child in enumerate(value):
                    walk(child, f"{path}[{index}]")

        for name in DATA_NAMES[:4]:
            walk(self.docs[name], name)
        for path, aid in occurrences:
            self.check(aid in assets, "REFERENCE.catalog_unknown", path, aid, "台帳内の資材ID")
        usage_contracts = r["usage_contracts"]
        self.unique([x["id"] for x in usage_contracts], "SCREEN.usage_duplicate", "usage_contracts")
        usage_edges = 0
        for contract in usage_contracts:
            self.check(bool(contract["asset_ids"]) and bool(contract["screens"]), "SCREEN.usage_nonempty", contract["id"])
            self.unique(contract["asset_ids"], "SCREEN.usage_asset_duplicate", contract["id"])
            self.unique(contract["screens"], "SCREEN.usage_screen_duplicate", contract["id"])
            self.check(set(contract["screens"]) <= SCREENS, "SCREEN.usage_screen_known", contract["id"])
            for aid in contract["asset_ids"]:
                self.check(aid in assets, "SCREEN.usage_asset_known", contract["id"], aid, "台帳内の資材ID")
                for screen in contract["screens"]:
                    self.check(screen in assets.get(aid, {}).get("placements", []), "SCREEN.required_placement",
                               contract["id"] + "." + aid, screen, "資材の配置画面へ含める")
                    usage_edges += 1
        screen_bindings = m["screen_bindings"]
        expected_screens = defaultdict(set)
        for aid, asset in assets.items():
            for screen in asset["placements"]:
                expected_screens[screen].add(aid)
        self.equal(set(screen_bindings), set(expected_screens), "SCREEN.ids", "screen_bindings")
        for screen, ids in screen_bindings.items():
            self.check(screen in SCREENS, "SCREEN.known", screen)
            self.unique(ids, "SCREEN.asset_duplicate", screen)
            self.equal(set(ids), expected_screens[screen], "SCREEN.reverse", screen)
            for aid in ids:
                self.check(aid in assets, "SCREEN.unknown_asset", screen, aid, "台帳内の資材ID")
        screen_edges = sum(len(ids) for ids in screen_bindings.values())
        self.equal(screen_edges, sum(len(asset["placements"]) for asset in assets.values()),
                   "SCREEN.edge_count", "screen_bindings / placements")
        self.equal(r["production_status"], "planned", "RENDER.production_status", "rendering_rules")
        self.equal(r["reference_images_are_not_game_sprites"], True, "RENDER.reference_only", "rendering_rules")
        self.equal(r["achievement_card"]["hidden"]["ids"], ["B05", "F06"], "RENDER.hidden", "achievement_card")
        self.equal([x["id"] for x in r["achievement_card"]["base_states"]],
                   ["unearned", "provisional", "earned", "ineligible_round"], "RENDER.achievement_states", "achievement_card")
        self.equal([x["id"] for x in r["achievement_card"]["adornments"]], ["selected", "pinned", "unread"],
                   "RENDER.adornments", "achievement_card")
        self.equal(r["district"]["scaffold_by_target_stage"], {"1": "scaffold_small", "2": "scaffold_medium", "3": "scaffold_medium", "4": "scaffold_large", "5": "scaffold_large"},
                   "RENDER.scaffold", "district")
        self.equal({x["id"]: x["allowed_stages"] for x in r["district"]["states"]},
                   {"closed": [0], "open_idle": [0, 1, 2, 3, 4], "plan_active": [0, 1, 2, 3, 4], "plan_paused": [0, 1, 2, 3, 4], "max_stage": [5]},
                   "RENDER.district_states", "district")
        self.equal(r["equipment_purchase"]["reason_priority"], ["session_locked", "capped", "condition_locked", "insufficient", "purchasable"],
                   "RENDER.purchase_priority", "equipment_purchase")
        self.equal(r["route"]["vehicle_count_limit"], 6, "RENDER.vehicle_limit", "route")
        self.equal(r["route"]["maximum_visible_per_route"], 1, "RENDER.vehicle_per_route", "route")
        self.equal(r["route"]["states"], ["closed", "road", "railway"], "RENDER.route_states", "route")
        self.equal(r["route"]["direction_vectors"], {"front": [2, 1], "front_mirrored": [-2, 1],
                                                      "rear": [2, -1], "rear_mirrored": [-2, -1]},
                   "RENDER.direction_vectors", "route")
        self.equal(r["data_precedes_animation"], True, "RENDER.data_precedence", "rendering_rules")
        self.equal(r["vehicle_shadow"]["asset_count"], 0, "RENDER.shadow_no_asset", "vehicle_shadow")
        slot_choices = {"title": 72, "frame": 4, "ornament": 2, "home_background": 1}
        self.equal({x["id"]: x["choices"] for x in r["cosmetic_selection"]["slots"]}, slot_choices,
                   "RENDER.cosmetic_choices", "cosmetic_selection")
        for slot in r["cosmetic_selection"]["slots"]:
            self.equal(slot["maximum_equipped"], 1, "RENDER.cosmetic_maximum", slot["id"])
        for key in ["none_allowed", "preview_is_not_equipped", "unowned_can_preview"]:
            self.equal(r["cosmetic_selection"][key], True, "RENDER.cosmetic_rule", key)
        forward_count = sum(len(x["asset_refs"]) for x in bindings)
        self.equal(forward_count, reverse_count, "REFERENCE.edge_count", "bindings / used_by")
        derived = {
            "achievement_stamp_art": len(a["achievements"]), "achievement_titles_dom": len(a["achievements"]),
            "family_postcards": len(a["families"]), "family_foil_boards": len(a["families"]),
            "additional_reward_items": len(a["rewards"]), "district_stage_entries": sum(len(d["stage_entries"]) for d in c["districts"]),
            "district_art_sources_including_empty": len({x["building_asset_id"] for d in c["districts"] for x in d["stage_entries"]}),
            "landscape_x_district_stage_combinations": 108, "base_packaging_states": len(e["packaging_levels"]),
            "crew_counts_per_route": len(e["crew_levels"]), "shop_counts_per_district": len(e["shop_levels"]),
            "road_vehicle_types": len({x["road_vehicle"] for x in e["crew_levels"]}), "rail_vehicle_types": 1,
            "vehicle_source_directions": 2, "vehicle_render_directions": 4, "research_rank_states": len(e["research_ranks"]),
            "word_texts_dom": 960, "fixed_route_geometries": len(c["map_layout"]["routes"]),
        }
        self.equal(m["derived_variants"], derived, "REFERENCE.derived_counts", "derived_variants")
        self.metrics.update({"bindings": len(bindings), "bindings_by_kind": dict(Counter(x["kind"] for x in bindings)),
                             "forward_reference_edges": forward_count, "reverse_reference_edges": reverse_count,
                             "catalog_asset_reference_occurrences": len(occurrences),
                             "screen_usage_contracts": len(usage_contracts), "required_screen_usage_edges": usage_edges,
                             "screen_asset_reference_edges": screen_edges, "screen_count": len(screen_bindings),
                             "orphan_assets": sum(not reverse[x] for x in assets)})

    def geometry(self):
        c, r, m = self.docs["city_catalog"], self.docs["rendering_rules"], self.docs["visual_resource_manifest"]
        layout = c["map_layout"]
        routes, boundary = layout["routes"], layout["shared_water_landward_boundary"]
        anchors = layout["anchors"]
        xy = lambda p: (rational(p["x"]), rational(p["y"])) if isinstance(p, dict) else tuple(rational(x) for x in p)
        self.equal(len(routes), 6, "ROUTE.count", "routes")
        self.equal({x["district_id"] for x in routes}, set(anchors), "ROUTE.districts", "routes")
        self.unique([x["id"] for x in routes], "ROUTE.duplicate", "routes")
        self.equal(set(anchors), {x["id"] for x in c["districts"]}, "MAP.anchors", "anchors")
        self.equal([layout["canvas"]["width"], layout["canvas"]["height"]], [1600, 1000], "MAP.canvas", "map_layout")
        source = layout["district_source_canvas"]
        display = layout["display_size"]
        scale = rational(layout["scale"])
        self.numeric(scale, Fraction(display["width"], source["width"]), "MAP.scale_x", "map_layout")
        self.numeric(scale, Fraction(display["height"], source["height"]), "MAP.scale_y", "map_layout")
        self.equal([source["width"], source["height"]], m["profiles"]["district"]["source_size"], "MAP.district_size", "map_layout")
        self.equal(list(xy(layout["source_anchor"])), m["profiles"]["district"]["anchor"], "MAP.district_anchor", "map_layout")
        self.equal(source["transparent_background"], True, "MAP.district_alpha", "map_layout")
        landscape = layout["landscape_source_canvas"]
        self.equal([landscape["width"], landscape["height"]], m["profiles"]["terrain"]["source_size"], "MAP.background_size", "map_layout")
        self.numeric(rational(landscape["width"]) * rational(landscape["scale_to_map"]), layout["canvas"]["width"], "MAP.background_scale", "width")
        self.numeric(rational(landscape["height"]) * rational(landscape["scale_to_map"]), layout["canvas"]["height"], "MAP.background_scale", "height")
        terrain_min = m["profiles"]["terrain"]["minimum_css"]
        self.equal(terrain_min, [800, 500], "MAP.minimum_full_map", "profiles.terrain")
        css_scale = rational(terrain_min[0]) / rational(layout["canvas"]["width"])
        self.numeric(css_scale, rational(terrain_min[1]) / rational(layout["canvas"]["height"]),
                     "MAP.minimum_full_map_aspect", "profiles.terrain")
        vehicle_css = [rational(n) * css_scale for n in [48, 36]]
        freight_display = layout["freight_unloading_site"]["display_size"]
        freight_css = [rational(freight_display[k]) * css_scale for k in ["width", "height"]]
        for profile_id, css_dimensions in [("vehicle", vehicle_css), ("freight", freight_css)]:
            for axis in range(2):
                self.check(css_dimensions[axis] >= rational(m["profiles"][profile_id]["minimum_css"][axis]),
                           "MAP.child_minimum_size", profile_id + "." + str(axis), str(css_dimensions[axis]),
                           str(m["profiles"][profile_id]["minimum_css"][axis]) + "以上")
        grid = r["collection_grid"]
        board = m["profiles"]["board"]
        self.equal(grid["board_source_size"], board["source_size"], "GRID.source_size", "collection_grid")
        self.equal(grid["board_minimum_css"], board["minimum_css"], "GRID.minimum_size", "collection_grid")
        self.equal(grid["board_minimum_css"], [600, 400], "GRID.minimum_contract", "collection_grid")
        self.equal(board["minimum_context"], "detail_with_six_stamps", "GRID.detail_context", "profiles.board")
        self.equal(board["thumbnail_minimum_css"], [240, 160], "GRID.thumbnail_minimum", "profiles.board")
        self.equal(board["thumbnail_context"], "emblem_and_status_only", "GRID.thumbnail_context", "profiles.board")
        self.numeric(rational(board["thumbnail_minimum_css"][0]) / rational(board["thumbnail_minimum_css"][1]),
                     rational(board["source_size"][0]) / rational(board["source_size"][1]), "GRID.thumbnail_aspect", "profiles.board")
        board_scale = rational(grid["board_minimum_css"][0]) / rational(grid["board_source_size"][0])
        self.numeric(board_scale, rational(grid["board_minimum_css"][1]) / rational(grid["board_source_size"][1]),
                     "GRID.aspect", "collection_grid")
        frame_css = rational(grid["stamp_frame_size_source"]) * board_scale
        stamp_frame_size = m["profiles"]["stamp_frame"]["source_size"]
        art_css = [frame_css * rational(m["profiles"]["stamp"]["source_size"][i]) / rational(stamp_frame_size[i]) for i in range(2)]
        self.equal(grid["individual_frame_min_css"], m["profiles"]["stamp_frame"]["minimum_css"], "GRID.frame_minimum", "collection_grid")
        self.equal(grid["individual_art_min_css"], m["profiles"]["stamp"]["minimum_css"], "GRID.art_minimum", "collection_grid")
        self.equal(grid["stamp_frame_size_source"], 240, "GRID.frame_source", "collection_grid")
        self.equal(len(grid["column_centers_source"]), 3, "GRID.columns", "collection_grid")
        self.equal(len(grid["row_centers_source"]), 2, "GRID.rows", "collection_grid")
        for axis in range(2):
            self.check(frame_css >= rational(grid["individual_frame_min_css"][axis]), "GRID.frame_readable", str(axis))
            self.check(art_css[axis] >= rational(grid["individual_art_min_css"][axis]), "GRID.art_readable", str(axis))
        for dimension, centers in [(0, grid["column_centers_source"]), (1, grid["row_centers_source"])]:
            half = rational(grid["stamp_frame_size_source"]) / 2
            self.check(all(half <= rational(center) <= rational(grid["board_source_size"][dimension]) - half for center in centers),
                       "GRID.frames_within_board", str(dimension))
            self.check(all(rational(b) - rational(a) >= 2 * half for a, b in zip(centers, centers[1:])),
                       "GRID.frame_spacing", str(dimension))
        self.check(grid["name_font_min_css"] >= 16, "GRID.name_font", "collection_grid")
        self.equal(grid["name_line_height_css"], 20, "GRID.name_line_height", "collection_grid")
        self.check(grid["name_line_height_css"] >= grid["name_font_min_css"], "GRID.name_line_height_font", "collection_grid")
        self.equal(grid["name_max_lines"], 2, "GRID.name_lines", "collection_grid")
        self.equal(grid["name_top_source"], [350, 700], "GRID.name_top", "collection_grid")
        self.equal(grid["name_max_width_source"], 336, "GRID.name_width", "collection_grid")
        self.equal(grid["name_anchor_mode"], "top_center", "GRID.name_anchor_mode", "collection_grid")
        self.equal(grid["inside_content"], ["切手の絵", "切手枠", "実績名", "選択とフォーカス枠"],
                   "GRID.inside_content", "collection_grid")
        self.equal(grid["outside_content"], ["条件文", "進捗", "獲得日", "獲得・未解除・仮達成の状態文", "目標固定・未読・装着の操作と表示"],
                   "GRID.outside_content", "collection_grid")
        self.texts(grid, ["large_text_rule", "thumbnail_rule", "card_hit_targets", "usage"], "GRID.responsive_text", "collection_grid")
        self.equal(board["inner_window_rect"], [32, 96, 1168, 784], "GRID.inner_window", "profiles.board")
        inner = [rational(x) for x in board["inner_window_rect"]]

        def within(rect, outer):
            return outer[0] <= rect[0] < rect[2] <= outer[2] and outer[1] <= rect[1] < rect[3] <= outer[3]

        def overlap(first, second):
            return first[0] < second[2] and second[0] < first[2] and first[1] < second[3] and second[1] < first[3]

        self.check(within(inner, [0, 0, *board["source_size"]]), "GRID.window_bounds", "profiles.board")
        half = rational(grid["stamp_frame_size_source"]) / 2
        frame_rects = [(rational(x) - half, rational(y) - half, rational(x) + half, rational(y) + half)
                       for y in grid["row_centers_source"] for x in grid["column_centers_source"]]
        name_half_width = rational(grid["name_max_width_source"]) / 2
        # Use explicit CSS line boxes; font glyphs still require runtime inspection.
        name_line_box_height = rational(grid["name_line_height_css"]) * grid["name_max_lines"] / board_scale
        name_rects = [(rational(x) - name_half_width, rational(y), rational(x) + name_half_width,
                       rational(y) + name_line_box_height)
                      for y in grid["name_top_source"] for x in grid["column_centers_source"]]
        for i, rect in enumerate(frame_rects):
            self.check(within(rect, inner), "GRID.frame_inner_window", str(i))
        for i, rect in enumerate(name_rects):
            self.check(within(rect, inner), "GRID.name_inner_window", str(i), [str(x) for x in rect], [str(x) for x in inner])
            for j, frame_rect in enumerate(frame_rects):
                self.check(not overlap(rect, frame_rect), "GRID.name_frame_overlap", f"name{i}.frame{j}")
            for j, other in enumerate(name_rects[:i]):
                self.check(not overlap(rect, other), "GRID.name_name_overlap", f"name{i}.name{j}")
        line_height_caps = []
        for row_index, top in enumerate(grid["name_top_source"]):
            next_frame_top = rational(grid["row_centers_source"][row_index + 1]) - half if row_index + 1 < len(grid["row_centers_source"]) else inner[3]
            available = min(inner[3], next_frame_top) - rational(top)
            line_height_cap = available * board_scale / grid["name_max_lines"]
            line_height_caps.append(line_height_cap)
            self.check(line_height_cap >= rational(grid["name_line_height_css"]), "GRID.name_line_height_capacity", str(row_index),
                       str(line_height_cap), str(grid["name_line_height_css"]) + "以上")
        self.equal(grid["header_emblem_center_source"], [96, 56], "GRID.header_emblem_anchor", "collection_grid")
        self.equal(grid["header_emblem_size_source"], 64, "GRID.header_emblem_size", "collection_grid")
        self.equal(grid["header_text_anchor_source"], [160, 56], "GRID.header_text_anchor", "collection_grid")
        self.equal(grid["header_text_anchor_mode"], "left_center", "GRID.header_anchor_mode", "collection_grid")
        self.equal(grid["header_text_max_font_css"], 24, "GRID.header_font", "collection_grid")
        self.equal(grid["header_line_height_css"], 32, "GRID.header_line_height", "collection_grid")
        self.check(grid["header_line_height_css"] >= grid["header_text_max_font_css"], "GRID.header_line_height_font", "collection_grid")
        emblem_half = rational(grid["header_emblem_size_source"]) / 2
        ex, ey = [rational(n) for n in grid["header_emblem_center_source"]]
        emblem_rect = [ex - emblem_half, ey - emblem_half, ex + emblem_half, ey + emblem_half]
        header_region = [rational(board["safe_rect"][0]), rational(board["safe_rect"][1]),
                         rational(board["safe_rect"][2]), inner[1]]
        self.check(within(emblem_rect, header_region), "GRID.header_emblem_region", "collection_grid")
        tx, ty = [rational(n) for n in grid["header_text_anchor_source"]]
        self.check(emblem_rect[2] < tx < header_region[2] and header_region[1] <= ty < header_region[3],
                   "GRID.header_text_region", "collection_grid")
        header_half_line = rational(grid["header_line_height_css"]) / board_scale / 2
        header_line_bounds = [ty - header_half_line, ty + header_half_line]
        self.check(header_region[1] <= header_line_bounds[0] < header_line_bounds[1] <= header_region[3],
                   "GRID.header_line_region", "collection_grid", [str(n) for n in header_line_bounds],
                   [str(header_region[1]), str(header_region[3])])
        for i, rect in enumerate(frame_rects + name_rects):
            self.check(not overlap(emblem_rect, rect), "GRID.header_overlap", str(i))
        self.equal(grid["layer_order"], ["paper_DOM", "board_base", "family_emblem", "stamp_art", "stamp_frame",
                                         "board_foil", "name_DOM", "focus_DOM"],
                   "GRID.layer_order", "collection_grid")
        collection_frame = r["collection_frame"]
        outer_frame_profile = m["profiles"]["frame"]
        self.equal(collection_frame["outer_canvas"], outer_frame_profile["source_size"], "FRAME.outer_size", "collection_frame")
        self.equal(collection_frame["inner_window_rect"], outer_frame_profile["inner_window_rect"],
                   "FRAME.window_profile", "collection_frame")
        self.equal(collection_frame["inner_window_rect"], [96, 96, 1104, 704], "FRAME.inner_window", "collection_frame")
        self.check(within(collection_frame["inner_window_rect"], [0, 0, *collection_frame["outer_canvas"]]),
                   "FRAME.window_bounds", "collection_frame")
        self.equal(collection_frame["layer_order"], ["surface_DOM", "content_art", "reward_frame", "text_DOM", "status_and_focus_DOM"],
                   "FRAME.layer_order", "collection_frame")
        self.texts(collection_frame, ["frame_art_zone", "content_fit"], "FRAME.composition_text", "collection_frame")
        self.equal(layout["additional_bridge_or_shore_mask_assets"], 0, "MAP.shared_background_no_extra", "map_layout")
        self.equal(r["shop_composition"]["source_size"], [layout["shop_source_canvas"]["width"], layout["shop_source_canvas"]["height"]], "MAP.shop_size", "map_layout")
        self.equal(r["shop_composition"]["anchor"], list(xy(layout["shop_source_anchor"])), "MAP.shop_anchor", "map_layout")
        for rid, key in [("shop_canopy", "awning"), ("shop_banner", "banner"), ("shop_signboard", "sign")]:
            self.equal(r["shop_composition"]["overlay_anchors"][rid], list(xy(layout["shop_attachment_anchors"][key])),
                       "MAP.shop_attachment", rid)
        src_anchor = xy(layout["source_anchor"])
        shop_src = xy(layout["shop_placement_source_anchor"])
        expected_shop_offset = tuple((shop_src[i] - src_anchor[i]) * scale for i in range(2))
        self.equal(xy(layout["shop_placement_map_offset"]), expected_shop_offset, "MAP.shop_offset", "map_layout")
        rectangles = {}
        for did, anchor in anchors.items():
            ax, ay = xy(anchor)
            left, top = ax - src_anchor[0] * scale, ay - src_anchor[1] * scale
            rectangles[did] = (left, top, left + display["width"], top + display["height"])
        hub_anchor = xy(layout["central_depot_anchor"])
        hub_profile = m["profiles"]["hub"]
        hub_scale = Fraction(128, hub_profile["source_size"][0])
        hx = hub_anchor[0] - rational(hub_profile["anchor"][0]) * hub_scale
        hy = hub_anchor[1] - rational(hub_profile["anchor"][1]) * hub_scale
        rectangles["central_depot"] = (hx, hy, hx + 128, hy + 128)
        shore = [xy(point) for point in boundary]
        self.check(len(shore) >= 2 and all(shore[i][1] < shore[i + 1][1] for i in range(len(shore) - 1)),
                   "MAP.water_monotonic", "shared_water_landward_boundary")
        self.equal(shore[0][1], 0, "MAP.water_start", "shared_water_landward_boundary")
        self.equal(shore[-1][1], 1000, "MAP.water_end", "shared_water_landward_boundary")

        def shore_x(y):
            for a0, a1 in zip(shore, shore[1:]):
                if a0[1] <= y <= a1[1]:
                    return a0[0] + (a1[0] - a0[0]) * (y - a0[1]) / (a1[1] - a0[1])
            raise ValueError("route y coordinate outside shared water boundary")

        def intersects_rect(p, q, rect):
            # Closed segment versus closed AABB, using exact Liang-Barsky clipping.
            low, high = Fraction(0), Fraction(1)
            for axis in range(2):
                v = q[axis] - p[axis]
                lo, hi = rect[axis], rect[axis + 2]
                if not v:
                    if p[axis] < lo or p[axis] > hi:
                        return False
                else:
                    t0, t1 = sorted(((lo - p[axis]) / v, (hi - p[axis]) / v))
                    low, high = max(low, t0), min(high, t1)
                    if low > high:
                        return False
            return True

        def point_segment_distance_squared(point, p, q):
            delta = (q[0] - p[0], q[1] - p[1])
            den = delta[0] ** 2 + delta[1] ** 2
            t = max(Fraction(0), min(Fraction(1), ((point[0] - p[0]) * delta[0] + (point[1] - p[1]) * delta[1]) / den)) if den else Fraction(0)
            return sum((point[i] - (p[i] + t * delta[i])) ** 2 for i in range(2))

        main_segments = 0
        geometric_segments = 0
        land_breakpoints = 0
        rectangle_checks = 0
        minimum_water_distance_squared = None
        for route in routes:
            rid, did = route["id"], route["district_id"]
            points = [xy(p) for p in route["points"]]
            connector = [xy(p) for p in route["terminal_connector"]]
            self.equal(rid, "route_" + did, "ROUTE.id", rid)
            self.check(len(points) >= 2, "ROUTE.points", rid)
            self.equal(points[0], xy(layout["central_dispatch_point"]), "ROUTE.start", rid)
            self.equal(points[-1], xy(route["vehicle_endpoint"]), "ROUTE.vehicle_endpoint", rid)
            self.equal(connector, [xy(route["vehicle_endpoint"]), xy(route["terminal_socket"])], "ROUTE.connector", rid)
            expected_socket = tuple(xy(anchors[did])[i] + xy(layout["freight_unloading_site"]["placement_map_offset"])[i] for i in range(2))
            self.equal(xy(route["terminal_socket"]), expected_socket, "ROUTE.socket", rid)
            self.equal(xy(layout["route_endpoints"][did]), expected_socket, "ROUTE.declared_endpoint", rid)
            self.check(sum((connector[1][i] - connector[0][i]) ** 2 for i in range(2)) <= 25,
                       "ROUTE.connector_length", rid, str(sum((connector[1][i] - connector[0][i]) ** 2 for i in range(2))), "長さの二乗が25以下")
            self.equal(route["asset_count"], 0, "ROUTE.no_asset", rid)
            self.equal(route["width_map_px"], 8, "ROUTE.width", rid)
            self.equal(route["track_sleeper_spacing_map_px"], 12, "ROUTE.sleeper", rid)
            self.equal(route["protected_corridor_radius_map_px"], 24, "ROUTE.corridor", rid)
            for p, q in zip(points, points[1:]):
                dx, dy = q[0] - p[0], q[1] - p[1]
                self.check(dx != 0 and abs(dy / dx) == Fraction(1, 2), "ROUTE.slope", rid,
                           str(dy / dx) if dx else "vertical", "±1/2")
                main_segments += 1
            segments = list(zip(points, points[1:])) + [(connector[0], connector[1])]
            for index, (p, q) in enumerate(segments):
                sp = f"{rid}.segment[{index}]"
                geometric_segments += 1
                self.check(all(0 <= point[0] <= 1600 and 0 <= point[1] <= 1000 for point in [p, q]),
                           "ROUTE.canvas_bounds", sp)
                # On each boundary y interval, shore_x(y)-route_x(y) is linear;
                # endpoint and boundary-crossing checks therefore cover the full segment.
                ts = {Fraction(0), Fraction(1)}
                if q[1] != p[1]:
                    ts.update((s[1] - p[1]) / (q[1] - p[1]) for s in shore
                              if 0 < (s[1] - p[1]) / (q[1] - p[1]) < 1)
                for t in sorted(ts):
                    x, y = (p[i] + t * (q[i] - p[i]) for i in range(2))
                    self.check(x < shore_x(y), "ROUTE.land", sp + ".t=" + str(t), str(x), "水際の陸側")
                    land_breakpoints += 1
                for did2, rect in rectangles.items():
                    self.check(not intersects_rect(p, q, rect), "ROUTE.building_intersection", sp + "." + did2)
                    rectangle_checks += 1
                for s0, s1 in zip(shore, shore[1:]):
                    distance = min(point_segment_distance_squared(p, s0, s1), point_segment_distance_squared(q, s0, s1),
                                   point_segment_distance_squared(s0, p, q), point_segment_distance_squared(s1, p, q))
                    self.check(distance >= rational(route["protected_corridor_radius_map_px"]) ** 2,
                               "ROUTE.water_corridor", sp, str(distance), "水際との距離の二乗が576以上")
                    minimum_water_distance_squared = distance if minimum_water_distance_squared is None else min(minimum_water_distance_squared, distance)
        harbor = xy(anchors["harbor"])
        for source_key, map_key in [("land_contact_source", "land_contact_map"), ("outer_tip_source", "outer_tip_map")]:
            point = xy(layout["harbor_pier"][source_key])
            mapped = tuple(harbor[i] + (point[i] - src_anchor[i]) * scale for i in range(2))
            self.equal(xy(layout["harbor_pier"][map_key]), mapped, "MAP.harbor_pier", map_key)
        contact = xy(layout["harbor_pier"]["land_contact_map"])
        self.equal(shore_x(contact[1]), contact[0], "MAP.harbor_shore_contact", "harbor_pier")
        keep = layout["freight_unloading_site"]["harbor_land_keepout_rect"]
        clear = layout["freight_unloading_site"]["harbor_water_clearance_map_px"]
        ys = {rational(keep["top"]), rational(keep["bottom"])} | {p[1] for p in shore if keep["top"] < p[1] < keep["bottom"]}
        for y in ys:
            self.check(shore_x(y) - keep["right"] >= clear, "MAP.harbor_freight_clearance", str(y))
        self.metrics.update({"fixed_routes": len(routes), "main_route_segments": main_segments,
                             "terminal_connectors": len(routes), "geometry_segments_including_connectors": geometric_segments,
                             "whole_segment_land_breakpoints": land_breakpoints, "segment_building_rectangle_checks": rectangle_checks,
                             "minimum_water_distance_squared_exact": str(minimum_water_distance_squared),
                             "route_protection_radius_map_px": 24,
                             "minimum_map_css": terrain_min,
                             "vehicle_at_minimum_map_css": [str(n) for n in vehicle_css],
                             "freight_at_minimum_map_css": [str(n) for n in freight_css],
                             "minimum_board_css": grid["board_minimum_css"],
                             "board_thumbnail_minimum_css": board["thumbnail_minimum_css"],
                             "stamp_frame_at_minimum_board_css": str(frame_css),
                             "stamp_art_at_minimum_board_css": [str(n) for n in art_css],
                             "board_name_rectangles": [[str(n) for n in rect] for rect in name_rects],
                             "board_name_max_width_css": str(rational(grid["name_max_width_source"]) * board_scale),
                             "board_name_line_box_height_css": str(rational(grid["name_line_height_css"]) * grid["name_max_lines"]),
                             "board_name_maximum_line_height_css_by_row": [str(n) for n in line_height_caps],
                             "board_name_maximum_line_height_css": str(min(line_height_caps)),
                             "board_name_geometry_scope": "explicit_two_line_CSS_boxes; glyph_metrics_and_enlarged_text_layout_require_runtime_review",
                             "board_header_emblem_rect_source": [str(n) for n in emblem_rect],
                             "board_header_line_bounds_source": [str(n) for n in header_line_bounds],
                             "board_header_text_anchor_mode": grid["header_text_anchor_mode"],
                             "board_name_anchor_mode": grid["name_anchor_mode"],
                             "board_header_text_scope": "anchor_and_explicit_CSS_line_height; full_text_width_requires_runtime_review"})


def mutation_tests(documents, context, baseline):
    """Each destructive edit is made on a fresh deepcopy, never on files."""
    tests = [
        ("achievement_missing", "実績1件の欠落", "ACH.count", lambda d: d["achievement_catalog"]["achievements"].pop()),
        ("price_wrong", "荷づくり価格を1コイン増額", "PRICE.formula", lambda d: d["equipment_catalog"]["packaging_levels"][12].__setitem__("next_price", d["equipment_catalog"]["packaging_levels"][12]["next_price"] + 1)),
        ("asset_missing", "資材1点の欠落", "REFERENCE.binding_unknown", lambda d: d["visual_resource_manifest"]["assets"].pop(0)),
        ("asset_duplicate_id", "資材IDの重複", "MANIFEST.duplicate_id", lambda d: d["visual_resource_manifest"]["assets"][-1].__setitem__("id", "stamp_a01")),
        ("appearance_wrong", "配送班10の外観帯を1へ変更", "EQUIP.crew.visual", lambda d: d["equipment_catalog"]["crew_levels"][9].__setitem__("visual_tier", 1)),
        ("research_multiplier_wrong", "研究ランク5の効果を変更", "RESEARCH.multiplier", lambda d: d["equipment_catalog"]["research_ranks"][-1].__setitem__("multiplier", "999")),
        ("zero_shop_paid", "店舗0→1を有償購入可能へ変更", "EQUIP.shop.paid", lambda d: d["equipment_catalog"]["shop_levels"][0].__setitem__("paid_purchase_reachable", True)),
        ("landscape_reuse_wrong", "海辺を川沿いの背景IDへ変更", "CITY.landscape.asset_unique", lambda d: d["city_catalog"]["landscapes"][1].__setitem__("asset_id", "terrain_riverside")),
        ("unknown_forward_ref", "未知の資材参照を追加", "REFERENCE.binding_unknown", lambda d: d["visual_resource_manifest"]["bindings"][0]["asset_refs"].append("missing_resource")),
        ("reverse_ref_missing", "資材の逆参照を1件削除", "REFERENCE.reverse", lambda d: d["visual_resource_manifest"]["assets"][0]["used_by"].pop()),
        ("route_slope_wrong", "経路の中間点を1px移動", "ROUTE.slope", lambda d: d["city_catalog"]["map_layout"]["routes"][0]["points"][1].__setitem__(1, 581)),
        ("terminal_connector_long", "終端コネクタを15pxへ延長", "ROUTE.connector_length", lambda d: d["city_catalog"]["map_layout"]["routes"][1]["terminal_connector"][1].__setitem__(1, 335)),
        ("route_submerged", "共通水際を経路の左へ移動", "ROUTE.land", lambda d: [p.__setitem__("x", 500) for p in d["city_catalog"]["map_layout"]["shared_water_landward_boundary"]]),
        ("source_hash_wrong", "語彙正本の保持ハッシュを変更", "SOURCE.sha256", lambda d: d["visual_resource_manifest"]["source_contracts"]["words.json"].__setitem__("sha256", "0" * 64)),
        ("references_as_delivered", "参考5枚を個別完成資材へ計上", "MANIFEST.delivered", lambda d: d["visual_resource_manifest"]["counts"].__setitem__("production_assets_delivered", 5)),
        ("hidden_wrong", "A01を隠し実績へ変更", "ACH.hidden_set", lambda d: d["achievement_catalog"]["achievements"][0].__setitem__("hidden", True)),
        ("synergy_cost_wrong", "連携の費用を変更", "SYNERGY.cost_coins", lambda d: d["equipment_catalog"]["synergies"][0].__setitem__("cost_coins", 1001)),
        ("development_cost_wrong", "段階1の資材費を変更", "CITY.stage.material_cost", lambda d: d["city_catalog"]["districts"][0]["stage_entries"][1].__setitem__("material_cost", 31)),
        ("district_alpha_wrong", "地区原画を非透過へ変更", "PROFILE.transparent", lambda d: d["visual_resource_manifest"]["profiles"]["district"].__setitem__("transparent", False)),
        ("canonical_price_wrong", "価格正本の1セルを変更", "PRICE.canonical_formula", lambda d: d["economy_config"]["price_tables"]["packaging_by_current_level"].__setitem__(12, 1)),
        ("required_screen_missing", "チュートリアルの切手配置先を削除", "SCREEN.required_placement", lambda d: next(a for a in d["visual_resource_manifest"]["assets"] if a["id"] == "stamp_a01")["placements"].remove("TUTORIAL")),
        ("screen_reverse_missing", "画面から資材への参照を1件削除", "SCREEN.reverse", lambda d: d["visual_resource_manifest"]["screen_bindings"]["HOME"].pop()),
        ("map_minimum_too_small", "全地図の最小幅を600pxへ縮小", "MAP.child_minimum_size", lambda d: d["visual_resource_manifest"]["profiles"]["terrain"].__setitem__("minimum_css", [600, 375])),
        ("board_minimum_too_small", "台紙の最小幅を360pxへ縮小", "GRID.art_readable", lambda d: d["rendering_rules"]["collection_grid"].__setitem__("board_minimum_css", [360, 240])),
        ("board_name_overflow", "台紙の下段名称を内窓の外へ移動", "GRID.name_inner_window", lambda d: d["rendering_rules"]["collection_grid"]["name_top_source"].__setitem__(1, 750)),
        ("scaffold_layer_wrong", "足場を地区本体のレイヤーへ変更", "MANIFEST.render_layer", lambda d: next(a for a in d["visual_resource_manifest"]["assets"] if a["id"] == "scaffold_small").__setitem__("render_layer", "district_art")),
        ("vehicle_direction_wrong", "正面車両の原画方向を変更", "MANIFEST.vehicle_native_direction", lambda d: next(a for a in d["visual_resource_manifest"]["assets"] if a["id"] == "vehicle_cart_front").__setitem__("native_direction_map", [2, -1])),
        ("board_composition_wrong", "名前を箔より先に描く合成順へ変更", "GRID.layer_order", lambda d: (d["rendering_rules"]["collection_grid"]["layer_order"].__setitem__(5, "name_DOM"), d["rendering_rules"]["collection_grid"]["layer_order"].__setitem__(6, "board_foil"))),
        ("outer_frame_window_wrong", "額縁の内窓を変更", "FRAME.window_profile", lambda d: d["rendering_rules"]["collection_frame"]["inner_window_rect"].__setitem__(3, 700)),
        ("board_name_line_height_wrong", "台紙の名前行高を24pxへ変更", "GRID.name_inner_window", lambda d: d["rendering_rules"]["collection_grid"].__setitem__("name_line_height_css", 24)),
        ("board_header_line_height_wrong", "台紙の見出し行高を48pxへ変更", "GRID.header_line_region", lambda d: d["rendering_rules"]["collection_grid"].__setitem__("header_line_height_css", 48)),
        ("board_header_anchor_wrong", "台紙見出しの基準点を左上へ変更", "GRID.header_anchor_mode", lambda d: d["rendering_rules"]["collection_grid"].__setitem__("header_text_anchor_mode", "left_top")),
    ]
    results = []
    base_signatures = {(x["code"], x["path"]) for x in baseline.errors}
    for tid, name, code, mutate in tests:
        clone = deepcopy(documents)
        try:
            mutate(clone)
        except (KeyError, TypeError, ValueError, IndexError, AttributeError, StopIteration) as exc:
            results.append({"id": tid, "name": name, "expected_error_code": code,
                            "detected": False, "matching_failures": 0, "total_failures": 0,
                            "example": None, "injection_error": str(exc)})
            continue
        result = Validation(clone, context).run()
        matches = [x for x in result.errors if x["code"] == code and (x["code"], x["path"]) not in base_signatures]
        results.append({"id": tid, "name": name, "expected_error_code": code,
                        "detected": bool(matches), "matching_failures": len(matches),
                        "total_failures": len(result.errors), "example": matches[0] if matches else None})
    return results


def load_context():
    documents = {}
    input_digests = {}
    for name in DATA_NAMES:
        content = (ROOT / "data" / (name + ".json")).read_bytes()
        documents[name] = json.loads(content)
        input_digests["data/" + name + ".json"] = sha256(content).hexdigest()
    game = (ROOT / "docs" / "game_experience.md").read_bytes()
    input_digests["docs/game_experience.md"] = sha256(game).hexdigest()
    source_digests = {}
    for name in ["economy_config.json", "words.json", "words.schema.json", "romaji_rules_v1.json"]:
        source_digests[name] = sha256((ROOT / "data" / name).read_bytes()).hexdigest()
    pngs = {}
    for name in ["home", "play", "result", "handbook", "upgrades"]:
        path = ROOT / "visuals" / (name + ".png")
        try:
            with path.open("rb") as stream:
                header = stream.read(24)
            valid = len(header) == 24 and header[:8] == b"\x89PNG\r\n\x1a\n" and header[12:16] == b"IHDR"
            width, height = struct.unpack(">II", header[16:24]) if valid else (0, 0)
            pngs[name] = {"valid_png": valid and width > 0 and height > 0, "width": width, "height": height}
        except OSError as exc:
            pngs[name] = {"valid_png": False, "error": str(exc)}
    return documents, {"game_experience": game.decode("utf-8"), "source_digests": source_digests,
                       "input_digests": input_digests, "reference_pngs": pngs}


def markdown_check(v):
    v.group = "markdown"
    try:
        proc = subprocess.run([sys.executable, str(ROOT / "tools" / "build_resource_docs.py"), "--check"],
                              cwd=ROOT, text=True, capture_output=True, timeout=60)
        v.check(proc.returncode == 0, "MARKDOWN.generated_match", "tools/build_resource_docs.py --check",
                {"exit_code": proc.returncode, "stdout": proc.stdout.strip(), "stderr": proc.stderr.strip()},
                "生成文書5点が一致")
        result = json.loads(proc.stdout) if proc.returncode == 0 else {}
        v.equal(result.get("documents"), 5, "MARKDOWN.document_count", "generated_documents")
        v.metrics["generated_markdown_documents"] = result.get("documents", 0)
        return {"command": "python3 tools/build_resource_docs.py --check", "exit_code": proc.returncode,
                "stdout": proc.stdout.strip(), "stderr": proc.stderr.strip(), "reports_excluded": True}
    except (OSError, subprocess.TimeoutExpired, ValueError) as exc:
        v.check(False, "MARKDOWN.execution", "generated_documents", str(exc), "文書一致検査の完了")
        return {"error": str(exc), "reports_excluded": True}


def make_markdown(report):
    metrics = report["metrics"]
    passed = report["status"] == "passed"
    if not passed:
        lines = ["# ことば便 資材検証報告", "", "版4.1", "",
                 f'資材一覧の契約照合は不合格である。{report["checks"]:,}件の判定を実行し、{len(report["errors"]):,}件の不一致を検出した。', "",
                 "この実行結果を全件合格の根拠として扱わない。不一致または読み取り不備を解消し、再実行した報告で結果を確認する。個別原画、実行時の視認性、操作、楽しさの検収はこの検査の対象外である。", "",
                 "## 実行した判定", "", "| 区分 | 判定 | 不一致 |", "|---|---:|---:|"]
        for group, counts in report["groups"].items():
            lines.append(f'| {GROUP_NAMES.get(group, group)} | {counts["checks"]:,} | {counts["failures"]:,} |')
        lines += ["", "## 検出した不一致", "", "| コード | 箇所 |", "|---|---|"]
        for error in report["errors"]:
            lines.append(f'| `{error["code"]}` | {str(error["path"]).replace("|", "｜")} |')
        lines += ["", "読めた値、期待値、集計、破損検出結果は[検証結果JSON](../data/resource_validation_report.json)に記録する。予定資材のファイルが存在しないこと自体はエラーにしない。", "",
                  "## 再実行", "", "```bash", "python3 tools/validate_resources.py", "```", ""]
        return "\n".join(lines)
    value = lambda key: f'{metrics.get(key, 0):,}'
    lines = ["# ことば便 資材検証報告", "", "版4.1", "",
             (f'資材一覧の契約照合は合格した。{report["checks"]:,}件の検査を実行し、不一致は0件だった。'
              if passed else f'資材一覧の契約照合で{len(report["errors"]):,}件の不一致を検出した。合格には以下の不一致の解消が必要となる。'), "",
             "この報告は、実績・地区・設備・描画規則・制作台帳と既存の経済設定・ゲーム体験仕様の数値、参照、座標を照合した結果である。個別資材は制作予定であり、完成原画、実行時の見え方、入力操作、楽しさを検証した結果ではない。", "",
             "## 1 検査件数", "", "| 区分 | 実行した判定 | 不一致 |", "|---|---:|---:|"]
    for group, counts in report["groups"].items():
        lines.append(f'| {GROUP_NAMES.get(group, group)} | {counts["checks"]:,} | {counts["failures"]:,} |')
    lines += [f'| 合計 | {report["checks"]:,} | {len(report["errors"]):,} |', "",
              "各行・各価格セル・各参照・各線分に対する独立した真偽判定を1件と数える。破損注入後に内部で再実行した全判定を合計へ重複加算せず、各破損事例の検出確認だけを加算した。", "",
              "## 2 実績と追加報酬", "",
              f'実績{value("achievements")}件は、ゲーム体験仕様の表にあるID、名称、解除条件、対象、隠し指定と一致する。{value("families")}系統それぞれ6件、称号IDは{value("titles")}件で重複しない。進捗欄{value("progress_fields")}項目、確定場面、保持規則、切手の図柄と見分け方の記入を検査した。隠し実績はB05とF06である。', "",
              f'追加報酬は{value("additional_rewards")}項目で、系統報酬{value("family_rewards")}項目と節目報酬{value("milestone_rewards")}項目からなる。記念切手{value("memorial_stamps_outside_72")}枚は実績72件の外に置く。報酬の効果は装飾のみで、専用画像を持たない謝辞はDOM表示として参照0件を認める。', "",
              "## 3 地区・設備・価格", "", "| 対象 | 実数 | 確認した内容 |", "|---|---:|---|",
              f'| 地区の全段階 | {value("district_stage_states")} | 6地区×段階0〜5。開通条件、段階費用、店舗上限、基礎収益 |',
              f'| 地区完成原画 | {value("district_completed_art")} | 段階1〜5の固有ID。段階0は共通更地1点 |',
              f'| 景観 | {value("landscapes")} | 共通配置に背景3点を合成。組み合わせ{value("landscape_stage_combinations")}通り |',
              f'| 荷づくり | {value("packaging_states")} | 全レベルの倍率、次価格、5外観帯、次の節目 |',
              f'| 配送班 | {value("crew_states_per_route")} | 1路線あたりの所有数。全輸送力、6地区価格、4道路車種 |',
              f'| 店舗 | {value("shop_states_per_district")} | 1地区あたりの所有数。全収益係数、最低段階、6地区価格、重ね部品 |',
              f'| 貨物鉄道 | {value("railways")} | 条件、コイン、自由在庫資材、輸送効果、経路ID |',
              f'| 連携設備 | {value("synergies")} | 費用、必要段階、効果 |',
              f'| 恒久研究 | {value("research_states")} | 3種類×ランク0〜5。次費用、累積費用、倍率 |', "",
              f'価格は{value("price_cells")}セルを検算した。内訳は荷づくり50、配送班294、店舗300である。各セルをFractionによる有理数の累乗と切り上げ、および経済設定の価格正本の両方へ照合し、式への照合{value("formula_price_checks")}件と価格正本への照合{value("canonical_price_checks")}件を実行した。価格正本自体も同じ式と照合した。', "",
              f'店舗0→1の{value("reference_only_zero_shop_price_cells")}セルは参照式の検算用である。段階0の上限は0軒、段階1完成時に1軒を無料配置するため、有償購入へ使わない。通常の有償購入として到達する価格は{value("reachable_paid_price_cells")}セルとなる。', "",
              "## 4 資材と参照", "", "| 項目 | 実数 |", "|---|---:|",
              f'| 画像・SVG | {value("visual_unique")} |', f'| ラスター原画 | {value("raster_unique")} |',
              f'| SVG図案 | {value("svg_unique")} |', f'| 音源 | {value("audio_unique")} |',
              f'| 個別制作資材の合計 | {value("all_unique")} |', f'| 実装用書き出しファイル | {value("runtime_export_files")} |',
              f'| 利用先の定義 | {value("bindings")} |', f'| 利用先から資材への参照辺 | {value("forward_reference_edges")} |',
              f'| 資材から利用先への逆参照辺 | {value("reverse_reference_edges")} |',
              f'| 各カタログ・描画規則内の参照出現 | {value("catalog_asset_reference_occurrences")} |',
              f'| 画面から資材への参照辺 | {value("screen_asset_reference_edges")} |',
              f'| 表示場面の利用契約 | {value("screen_usage_contracts")} |',
              f'| 利用契約が要求する資材と画面の対応 | {value("required_screen_usage_edges")} |',
              f'| 孤立資材 | {value("orphan_assets")} |', f'| 寸法等を解決した資材 | {value("resolved_asset_profiles")} |',
              f'| 制作プロファイル | {value("asset_profiles")} |', f'| 参考画面PNG | {value("reference_screen_images")} |',
              f'| 完成済みとして納品された個別資材 | {value("production_assets_delivered")} |', "",
              "全資材のID、種類、カテゴリ、制作段階、原画形式、書き出し先を照合した。各資材のプロファイルから寸法、透過の有無、基準点、安全矩形、配置画面を解決し、JSON報告へ全件を記録した。正参照と逆参照は同じ辺集合を持ち、重複ID、未知の参照先、孤立を認めない。", "",
              f'表示場面の利用契約{value("screen_usage_contracts")}件は、要求される{value("required_screen_usage_edges")}組の資材と画面が台帳の配置先へ含まれることを確認した。{value("screen_count")}画面から資材を引く参照表も、各資材の配置画面と逆方向に照合し、{value("screen_asset_reference_edges")}辺が一致する。', "",
              "参考画面5枚はPNGヘッダーと寸法を確認した参考資料であり、個別資材の完成数へ加算しない。全248資材の状態はplannedで、予定された画像や音源がまだ存在しないこと自体は不一致にしない。画像241点と音源7点に対し書き出しが249ファイルとなるのは、BGM1音源をOggとMP3の2形式で出力するためである。", "",
              "## 5 経路と背景の座標契約", "",
              f'固定{value("fixed_routes")}経路の本線{value("main_route_segments")}線分を確認し、全ての傾きが±1/2であることを有理数で判定した。終端コネクタ{value("terminal_connectors")}本は5map_px以下で、地区基準点と積み下ろし場の接点が一致する。', "",
              f'本線と終端を合わせた{value("geometry_segments_including_connectors")}線分を、共通水際と比較した。水際の区分境界を含む{value("whole_segment_land_breakpoints")}点で線形区間の両端を確認し、全線分の中心が陸側にあることを判定した。さらに24map_pxの保護幅を水際との厳密な線分距離で検査した。6地区と中央集配所の配置矩形に対する{value("segment_building_rectangle_checks")}件の交差判定は、線分の連続区間全体を対象とする。', "",
              "桟橋の原画座標から地図座標への変換、共通水際との接点、港の貨物場の18map_px以上の水際余白も検査した。これらは座標データと予定寸法の契約検査である。制作された3背景に水面、木、岩が正しく描かれるか、縮小時に建物と車両が見分けられるかは、原画完成後の合成検収に残る。", "",
              "全地図の最小表示800×500 CSS pxでは、48×36 map_pxの車両が24×18 CSS px、64×48 map_pxの貨物場が32×24 CSS pxとなり、それぞれの最小表示寸法を満たす。台紙の最小表示600×400 CSS pxでは、原画内240pxの切手枠が120 CSS px、内側の切手絵が96 CSS pxとなり、枠90px・絵72pxの下限を満たす。紋章と完成状態だけのサムネイルは240×160 CSS pxを下限とし、6切手を載せる詳細表示と区別する。", "",
              "3列×2行の切手枠と名称の予約矩形は、台紙の内窓(32,96)〜(1168,784)へ収まり、互いに重ならない。名称は上端・横中央を基準とし、幅336source_pxは最小台紙で168 CSS pxとなる。名前は16px、行高20px、最大2行で40pxの領域を使い、下段の始点350pxから終点390pxまでが内窓下端392pxへ収まる。文字拡大時は行高を押しつぶさず2列または1列のDOMカードへ切り替える。数値検査は通常表示の明示された行ボックスを対象とし、実フォントの字形と拡大後の画面は実装後に検収する。", "",
              "固定台紙の内側には切手の絵、切手枠、実績名、選択とフォーカス枠を配置する。条件文、進捗、獲得日、状態文、目標固定・未読・装着の操作と表示は台紙外の詳細へ置く。固定台紙は完成した収集物の鑑賞用で、通常の実績カードは高さが内容に応じて変わるDOMとして構成する。この配置区分と、末尾を名前→フォーカスとする合成順を照合した。", "",
              "見出しの紋章は64×64source_px、中心(96,56)の矩形として上端の予約領域へ収まる。見出し文字の基準点(160,56)はxが左端、yが縦中央であることを明示契約として照合した。最大文字サイズ24 CSS px、行高32 CSS pxから、縦の範囲source y24〜88（最小台紙で12〜44 CSS px）が予約領域内にあることを確認した。見出しの文字幅は実際の文字描画で検収する。台紙と額縁それぞれの内窓と合成順、および全248資材のrender_layerも照合した。足場3点と店舗の重ね部品3点は寸法プロファイルのレイヤーを適切に上書きする。", "",
              "車両10原画の無反転方向はfront=(2,1)、rear=(2,−1)で、描画規則の4方向ベクトルと一致する。左右反転後の方向は(−2,1)/(−2,−1)となり、本線の傾き±1/2へ対応する。", "",
              "## 6 破損検出の確認", "",
              "各事例は読み込んだデータのdeepcopyへ1種類の変更を加え、同じ検査器で意図したエラーを検出した。実ファイルは変更していない。元から存在するエラーと同じコード・箇所だけでは検出成功に数えない。", "",
              "| 注入した破損 | 検出対象のコード | 結果 |", "|---|---|---|"]
    for test in report["mutation_tests"]:
        lines.append(f'| {test["name"]} | `{test["expected_error_code"]}` | {"検出" if test["detected"] else "未検出"} |')
    lines += ["", "## 7 原本の保持と文書一致", "",
              f'経済設定、語彙、語彙スキーマ、ローマ字規則の{value("unchanged_source_contracts")}原本を、制作台帳に記録されたSHA-256と照合した。語彙そのものの内容試験や経済シミュレーションの試験件数は、この資材検査へ加算しない。', "",
              f'実績一覧、街の発展一覧、設備一覧、資材一覧、実装仕様の生成文書{value("generated_markdown_documents")}点を、`python3 tools/build_resource_docs.py --check`で照合した。この報告書とJSON報告は文書生成の比較対象に含めない。', "",
              "## 8 原画完成後の検収", "",
              "完成原画では寸法・透過・基準点・書き出し形式を実ファイルから検査する。現段階では、これらの予定値が台帳内で矛盾しないことまでを確認した。", "",
              "原画と実装がそろった後は、72pxの切手で同系統6枚を見分けられること、96×72pxの地区で段階差が伝わること、3背景で店舗・桟橋・貨物場・路線が自然につながることを検収する。状態表示、目標ピン、未読、装着、動き軽減、文字拡大、音源のループ境界についても実際の合成と操作で確認する。楽しさや学習のしやすさは、別途、実機の入力確認と初見観察で判断する。", "",
              "## 9 再実行", "", "同梱ルートで次のコマンドを実行すると、全検査と破損検出確認を行い、JSON報告と本報告を更新する。不一致または破損未検出があれば終了コード1を返す。", "",
              "```bash", "python3 tools/validate_resources.py", "```", "",
              "詳細は[検証結果JSON](../data/resource_validation_report.json)と[検査器](../tools/validate_resources.py)に記録する。検査対象の値は実行時に読み直して再計算する。", ""]
    if report["errors"]:
        lines += ["## 検出した不一致", "", "| コード | 箇所 |", "|---|---|"]
        for error in report["errors"]:
            lines.append(f'| `{error["code"]}` | {str(error["path"]).replace("|", "｜")} |')
        lines.append("")
    return "\n".join(lines)


def main():
    try:
        documents, context = load_context()
    except (OSError, ValueError, TypeError) as exc:
        report = {"schema_version": "1.0.0", "catalog_version": "4.1.0",
                  "validation_scope": "resource_contracts_only", "status": "failed", "checks": 1,
                  "contractual_checks": 0, "groups": {"source": {"checks": 1, "failures": 1}},
                  "metrics": {}, "errors": [{"group": "source", "code": "INPUT.read",
                                               "path": "入力ファイル", "actual": str(exc), "expected": "必要な正本を読み取れること"}],
                  "mutation_tests": [], "resolved_assets": [],
                  "generated_markdown_check": {"executed": False, "reason": "入力読み取り失敗"}}
        (ROOT / "data" / "resource_validation_report.json").write_text(
            json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        (ROOT / "docs" / "resource_validation_report.md").write_text(make_markdown(report), encoding="utf-8")
        print("資材検査の入力を読めません: " + str(exc), file=sys.stderr)
        return 1
    result = Validation(documents, context).run()
    md_result = markdown_check(result)
    contractual_checks = sum(x["checks"] for x in result.groups.values())
    mutations = mutation_tests(documents, context, result)
    result.group = "mutation"
    for case in mutations:
        result.check(case["detected"], "MUTATION.not_detected", case["id"], case["detected"], True)
    result.metrics["mutation_cases"] = len(mutations)
    result.metrics["detected_mutation_cases"] = sum(x["detected"] for x in mutations)
    report = {
        "schema_version": "1.0.0", "catalog_version": "4.1.0",
        "validation_scope": "resource_contracts_only", "status": "failed" if result.errors else "passed",
        "checks": sum(x["checks"] for x in result.groups.values()), "contractual_checks": contractual_checks,
        "groups": dict(result.groups), "metrics": result.metrics, "errors": result.errors,
        "mutation_tests": mutations, "generated_markdown_check": md_result,
        "source_sha256": context["source_digests"], "input_sha256": context["input_digests"],
        "reference_png_headers": context["reference_pngs"], "resolved_assets": result.resolved_assets,
        "limitations": [
            "個別の画像・SVG・音源はplanned。実ファイルの完成検査はしていない。",
            "実行時の視認性・操作・楽しさを検証した結果ではない。",
            "経路検査は共通の折れ線水際・予定矩形・座標データに対して実施。完成した背景の描画検収は別途必要。",
            "参考5PNGは個別資材の完成点数へ含めない。",
        ],
    }
    (ROOT / "data" / "resource_validation_report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2, default=compact) + "\n", encoding="utf-8")
    (ROOT / "docs" / "resource_validation_report.md").write_text(make_markdown(report), encoding="utf-8")
    print(json.dumps({"status": report["status"], "checks": report["checks"], "errors": len(result.errors),
                      "price_cells": result.metrics.get("price_cells"), "paid_price_cells": result.metrics.get("reachable_paid_price_cells"),
                      "assets": result.metrics.get("all_unique"), "bindings": result.metrics.get("bindings"),
                      "reference_edges": result.metrics.get("forward_reference_edges"),
                      "mutations_detected": result.metrics["detected_mutation_cases"], "mutation_cases": len(mutations)}, ensure_ascii=False))
    if result.errors:
        for error in result.errors[:20]:
            print(error["code"] + ": " + error["path"], file=sys.stderr)
    return 1 if result.errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
