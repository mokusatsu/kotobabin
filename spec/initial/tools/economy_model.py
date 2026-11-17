#!/usr/bin/env python3
"""ことば便: integer, deterministic economy reference model (Python standard library).

Examples:
  python tools/economy_model.py example
  python tools/economy_model.py validate --report data/economy_validation_report.json
  python tools/economy_model.py balance
  python tools/economy_model.py replay events.json --save-state state.json

This is a numerical reference, not the typing game. External completion and shipment
facts must already be confirmed by the typing system. Every economic fact carries
city_id, session_id and fact_sequence. Time advances in integer milliseconds; a
threshold reached within a millisecond takes effect at the end of that millisecond.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import math
import random
import sys
from dataclasses import asdict, dataclass
from fractions import Fraction
from pathlib import Path
from typing import Any


DEFAULT_CONFIG = Path(__file__).resolve().parents[1] / "data/economy_config.json"


class EconomyError(ValueError):
    """A rejected operation; no purchase or resource generation was applied."""


def ceil_div(numerator: int, denominator: int) -> int:
    if numerator < 0 or denominator <= 0:
        raise EconomyError("ceil_div requires a nonnegative numerator and positive denominator")
    return (numerator + denominator - 1) // denominator


def require_int(value: Any, name: str, minimum: int = 0) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < minimum:
        raise EconomyError(f"{name} must be an integer >= {minimum}")
    return value


def parse_micro(value: Any) -> int:
    if not isinstance(value, str) or not value.isdecimal():
        raise EconomyError("saved micro amounts must be nonnegative decimal strings")
    return int(value)


def exact_integer(value: Fraction, name: str) -> int:
    if value.denominator != 1:
        raise EconomyError(f"{name} is not exactly representable in the configured micro unit")
    return value.numerator


def rational_json(value: Fraction) -> dict[str, int]:
    return {"numerator": value.numerator, "denominator": value.denominator}


def decimal_text(value: int, unit: int = 1_000_000) -> str:
    sign = "-" if value < 0 else ""
    whole, fraction = divmod(abs(value), unit)
    digits = str(fraction).zfill(len(str(unit)) - 1).rstrip("0")
    return f"{sign}{whole}" + (f".{digits}" if digits else "")


@dataclass
class Plan:
    target_stage: int
    required_micro: int
    reserved_micro: int = 0
    paid_coins_micro: int = 0
    paused: bool = False


@dataclass
class District:
    open: bool = False
    stage: int = 0
    shops: int = 0
    crews: int = 0
    railway: bool = False
    queue_micro: int = 0
    stock_micro: int = 0
    arrived_micro: int = 0
    plan: Plan | None = None


@dataclass
class Session:
    session_id: str
    district_id: str
    mode: str
    multiplier_numerator: int
    multiplier_denominator: int
    city_id: str
    started_at_ms: int
    generated_start_micro: int
    arrived_start_micro: int
    delivery_coins_start_micro: int
    shop_coins_start_micro: int

    @property
    def multiplier(self) -> Fraction:
        return Fraction(self.multiplier_numerator, self.multiplier_denominator)


class EconomyModel:
    def __init__(self, config_path: str | Path | None = None, *, wall_ms: int = 0):
        self.config_path = Path(config_path) if config_path else DEFAULT_CONFIG
        self.config = json.loads(self.config_path.read_text(encoding="utf-8"))
        self.unit = int(self.config["arithmetic"]["micro_unit"])
        self.district_config = {d["id"]: d for d in self.config["districts"]}
        self.stage_config = {d["stage"]: d for d in self.config["development"]["stages"]}
        self.synergy_config = {s["id"]: s for s in self.config["synergies"]}
        self.research = {r["id"]: 0 for r in self.config["research"]["types"]}
        self.blueprints = self.config["initial"]["blueprints"]
        self.persistent = {"vocabulary": [], "stamps": [], "records": {}, "settings": {}}
        self.lifetime = {
            "completed_words": 0, "economic_shipments": 0, "legacy_shipments": 0,
            "generated_micro": 0, "arrived_micro": 0, "delivery_coins_micro": 0,
            "shop_coins_micro": 0, "cities_restarted": 0,
        }
        self.clock_ms = 0
        self.saved_wall_ms = require_int(wall_ms, "wall_ms")
        self.city_sequence = 1
        self.city_id = "city-1"
        self.landscape = self.config["initial"]["landscape"]
        self._reset_city()

    def _reset_city(self) -> None:
        cfg = self.config["initial"]
        self.coins_micro = int(cfg["coins_micro"])
        self.packaging_level = cfg["packaging_level"]
        self.city_arrived_micro = 0
        self.synergies: set[str] = set()
        self.active_session: Session | None = None
        self.last_session_summary: dict[str, Any] | None = None
        self.used_session_ids: set[str] = set()
        self.fact_ledger: dict[str, str] = {}
        self.construction_history: list[dict[str, Any]] = []
        self.districts: dict[str, District] = {}
        for ident in self.district_config:
            is_open = ident in cfg["open_districts"]
            self.districts[ident] = District(
                open=is_open, crews=cfg["crews_per_open_route"] if is_open else 0)
        plan = cfg["active_plan"]
        district = self.districts[plan["district_id"]]
        cost = self.development_cost(plan["district_id"], plan["target_stage"])
        district.plan = Plan(plan["target_stage"], cost["materials_micro"],
                             paid_coins_micro=cost["coins_micro"])
        self.assert_invariants()

    def milestone_factor(self, count: int) -> int:
        cfg = self.config["equipment"]
        return cfg["milestone_factor"] ** sum(count >= n for n in cfg["milestones"])

    def research_multiplier(self, kind: str, rank: int | None = None) -> Fraction:
        if kind not in self.research:
            raise EconomyError("unknown research")
        level = self.research[kind] if rank is None else require_int(rank, "rank")
        if level > self.config["research"]["maximum_rank"]:
            raise EconomyError("research rank exceeds cap")
        cfg = self.config["research"]["multiplier"]
        return Fraction(cfg["base_numerator"] + cfg["rank_numerator"] * level,
                        cfg["denominator"])

    def packaging_multiplier(self, level: int | None = None) -> Fraction:
        count = self.packaging_level if level is None else require_int(level, "level")
        cfg = self.config["equipment"]["packaging"]
        if count > cfg["maximum"]:
            raise EconomyError("packaging level exceeds cap")
        mult = cfg["material_multiplier"]
        return (Fraction(mult["base_numerator"] + mult["level_numerator"] * count,
                         mult["denominator"]) * self.milestone_factor(count))

    def material_multiplier(self) -> Fraction:
        return self.packaging_multiplier() * self.research_multiplier("materials")

    def delivery_reward(self) -> int:
        reward = self.config["delivery_reward"]["coins_per_material"]
        for ident in sorted(self.synergies):
            reward = self.synergy_config[ident]["effect"].get("delivery_coins_per_material", reward)
        return reward

    def transport_per_second_micro(self, district_id: str, *, crews: int | None = None) -> int:
        d = self._district(district_id)
        if not d.open:
            return 0
        n = d.crews if crews is None else crews
        base = self.config["equipment"]["crews"]["base_material_per_crew_second"]
        rate = Fraction(base * n * self.milestone_factor(n) * self.unit)
        rate *= self.research_multiplier("logistics")
        if d.railway:
            rate *= self.config["railway"]["transport_factor"]
        for ident in self.synergies:
            rate *= self.synergy_config[ident]["effect"].get("transport_factor", 1)
        return exact_integer(rate, "transport rate")

    def shop_income_per_second_micro(self, district_id: str, *, shops: int | None = None) -> int:
        d = self._district(district_id)
        if not d.open or d.stage == 0:
            return 0
        n = d.shops if shops is None else shops
        cfg = self.config["equipment"]["shops"]
        rate = Fraction(int(self.district_config[district_id]["shop_base_income_per_second_micro"]))
        rate *= n * cfg["stage_factor"] ** (d.stage + cfg["stage_exponent_offset"])
        rate *= self.milestone_factor(n) * self.research_multiplier("commerce")
        for ident in self.synergies:
            rate *= self.synergy_config[ident]["effect"].get("shop_income_factor", 1)
        return exact_integer(rate, "shop income rate")

    def total_income_per_second_micro(self) -> int:
        return sum(self.shop_income_per_second_micro(ident) for ident in self.districts)

    def wait_ms(self, district_id: str, *, crews: int | None = None) -> int:
        d = self._district(district_id)
        if d.queue_micro == 0:
            return 0
        per_ms = self.transport_per_second_micro(district_id, crews=crews) // 1000
        if per_ms <= 0:
            raise EconomyError("queued material has no active transport")
        return ceil_div(d.queue_micro, per_ms)

    def _district(self, district_id: str) -> District:
        if district_id not in self.districts:
            raise EconomyError("unknown district")
        return self.districts[district_id]

    def _require_idle(self) -> None:
        if self.active_session is not None:
            raise EconomyError("end the current session before investment or plan operations")

    def _event_time(self, at_ms: int | None) -> None:
        if at_ms is not None:
            self.advance_to(at_ms)

    def _settle_plans(self) -> list[dict[str, Any]]:
        completed = []
        for ident, d in self.districts.items():
            p = d.plan
            if p is None or p.paused:
                continue
            transfer = min(d.stock_micro, p.required_micro - p.reserved_micro)
            d.stock_micro -= transfer
            p.reserved_micro += transfer
            if p.reserved_micro == p.required_micro:
                d.stage = p.target_stage
                if d.stage == 1:
                    d.shops += self.config["development"]["free_shops_at_stage_one"]
                item = {"district_id": ident, "stage": d.stage, "clock_ms": self.clock_ms,
                        "consumed_micro": str(p.required_micro)}
                completed.append(item)
                self.construction_history.append(item)
                d.plan = None
        return completed

    def _advance(self, elapsed_ms: int) -> dict[str, Any]:
        # All rates in the shipped configuration divide into exact micro/ms values.
        require_int(elapsed_ms, "elapsed_ms")
        start = self.clock_ms
        delivered = passive = 0
        segments = []
        completed = self._settle_plans()
        remaining = elapsed_ms
        while remaining:
            rates = {}
            boundaries = [remaining]
            income = exact_integer(Fraction(self.total_income_per_second_micro(), 1000),
                                   "shop income per millisecond")
            for ident, d in self.districts.items():
                rate = exact_integer(Fraction(self.transport_per_second_micro(ident), 1000),
                                     "transport per millisecond")
                rates[ident] = rate
                if d.queue_micro and rate:
                    boundaries.append(ceil_div(d.queue_micro, rate))
                    p = d.plan
                    if p and not p.paused:
                        need = p.required_micro - p.reserved_micro
                        if need <= d.queue_micro:
                            boundaries.append(ceil_div(need, rate))
            step = min(boundaries)
            if step <= 0:
                raise EconomyError("invalid zero-length simulation boundary")
            shop_coins = income * step
            self.coins_micro += shop_coins
            passive += shop_coins
            moved_total = 0
            for ident, d in self.districts.items():
                moved = min(d.queue_micro, rates[ident] * step)
                d.queue_micro -= moved
                d.stock_micro += moved
                d.arrived_micro += moved
                moved_total += moved
            delivery_coins = moved_total * self.delivery_reward()
            self.coins_micro += delivery_coins
            self.city_arrived_micro += moved_total
            self.lifetime["arrived_micro"] += moved_total
            self.lifetime["delivery_coins_micro"] += delivery_coins
            self.lifetime["shop_coins_micro"] += shop_coins
            delivered += moved_total
            self.clock_ms += step
            remaining -= step
            newly_completed = self._settle_plans()
            completed.extend(newly_completed)
            segments.append({
                "start_ms": self.clock_ms - step, "end_ms": self.clock_ms,
                "shop_income_per_second_micro": str(income * 1000),
                "arrived_micro": str(moved_total), "delivery_coins_micro": str(delivery_coins),
                "shop_coins_micro": str(shop_coins), "completed": newly_completed,
            })
        self.assert_invariants()
        return {"start_ms": start, "end_ms": self.clock_ms,
                "credited_ms": elapsed_ms, "arrived_micro": str(delivered),
                "shop_coins_micro": str(passive), "completed": completed,
                "segments": segments}

    def advance(self, elapsed_ms: int, *, wall_ms: int | None = None) -> dict[str, Any]:
        """Advance a new online interval. Use advance_to for retryable absolute times."""
        if isinstance(elapsed_ms, bool) or not isinstance(elapsed_ms, int):
            raise EconomyError("elapsed_ms must be an integer")
        elapsed_ms = max(0, elapsed_ms)
        result = self._advance(elapsed_ms)
        if wall_ms is None:
            self.saved_wall_ms += elapsed_ms
        else:
            self.saved_wall_ms = max(self.saved_wall_ms, require_int(wall_ms, "wall_ms"))
        return result

    def advance_to(self, target_ms: int, *, wall_ms: int | None = None) -> dict[str, Any]:
        require_int(target_ms, "target_ms")
        return self.advance(max(0, target_ms - self.clock_ms), wall_ms=wall_ms)

    def restore_at(self, wall_ms: int) -> dict[str, Any]:
        """Credit at most 8 h and commit the wall timestamp in the same saved state."""
        require_int(wall_ms, "wall_ms")
        old_wall = self.saved_wall_ms
        actual = max(0, wall_ms - old_wall)
        credited = min(actual, self.config["offline"]["maximum_elapsed_ms"])
        result = self._advance(credited)
        # Retaining the high-water mark also prevents credits after a clock rollback.
        self.saved_wall_ms = max(old_wall, wall_ms)
        result.update({"wall_elapsed_ms": actual, "capped_ms": actual - credited,
                       "saved_wall_ms": self.saved_wall_ms})
        return result

    def begin_session(self, session_id: str, district_id: str = "residential",
                      mode: str = "normal", *, at_ms: int | None = None) -> dict[str, Any]:
        self._event_time(at_ms)
        if self.active_session is not None:
            raise EconomyError("a session is already active")
        if not isinstance(session_id, str) or not session_id or session_id in self.used_session_ids:
            raise EconomyError("session_id must be nonempty and unused in this city")
        if mode not in self.config["material_generation"]["modes"]:
            raise EconomyError("unknown session mode")
        if not self._district(district_id).open:
            raise EconomyError("destination is not open")
        factor = self.material_multiplier()
        self.active_session = Session(session_id, district_id, mode,
                                      factor.numerator, factor.denominator, self.city_id,
                                      self.clock_ms, self.lifetime["generated_micro"],
                                      self.city_arrived_micro, self.lifetime["delivery_coins_micro"],
                                      self.lifetime["shop_coins_micro"])
        self.used_session_ids.add(session_id)
        return self._micro_dict(asdict(self.active_session))

    def end_session(self, *, at_ms: int | None = None) -> dict[str, Any] | None:
        self._event_time(at_ms)
        # Ending alone never manufactures an unshipped bonus.
        s = self.active_session
        if s is not None:
            self.last_session_summary = {
                "session_id": s.session_id, "city_id": s.city_id,
                "district_id": s.district_id, "mode": s.mode,
                "start_ms": s.started_at_ms, "end_ms": self.clock_ms,
                "generated_micro": str(self.lifetime["generated_micro"] - s.generated_start_micro),
                "arrived_during_session_micro": str(self.city_arrived_micro - s.arrived_start_micro),
                "delivery_coins_micro": str(self.lifetime["delivery_coins_micro"] - s.delivery_coins_start_micro),
                "shop_coins_micro": str(self.lifetime["shop_coins_micro"] - s.shop_coins_start_micro),
                "arrivals_include_preexisting_queue": True,
                "remaining_queue_micro": str(self.districts[s.district_id].queue_micro),
            }
        self.active_session = None
        return copy.deepcopy(self.last_session_summary)

    def _fact(self, session_id: str, fact_sequence: int, city_id: str | None,
              payload: dict[str, Any]) -> tuple[str | None, str | None, Session | None]:
        if city_id is None:
            raise EconomyError("economic facts require an explicit city_id")
        if city_id != self.city_id:
            return None, "stale_city", None
        require_int(fact_sequence, "fact_sequence")
        key = json.dumps([city_id, session_id, fact_sequence], ensure_ascii=False,
                         separators=(",", ":"))
        fingerprint = hashlib.sha256(json.dumps(payload, sort_keys=True,
                                                separators=(",", ":")).encode()).hexdigest()
        if key in self.fact_ledger:
            if self.fact_ledger[key] != fingerprint:
                raise EconomyError("fact identifier reused with different content")
            return None, "duplicate", None
        session = self.active_session
        if session is None or session.session_id != session_id:
            raise EconomyError("the referenced session is not active")
        return key, fingerprint, session

    def complete_word(self, session_id: str, fact_sequence: int, base_length: int, *,
                      city_id: str | None = None, mistakes: int = 0, completed: bool = True,
                      confirmation: bool = False, at_ms: int | None = None) -> dict[str, Any]:
        self._event_time(at_ms)
        require_int(base_length, "base_length", 1)
        require_int(mistakes, "mistakes")
        payload = {"kind": "WordCompleted", "base_length": base_length,
                   "mistakes": mistakes, "completed": completed, "confirmation": confirmation}
        key, fingerprint, session = self._fact(session_id, fact_sequence, city_id, payload)
        if key is None:
            return {"applied": False, "reason": fingerprint, "generated_micro": "0"}
        factor = self.config["material_generation"]["base_material_per_length"]
        base = Fraction(base_length * factor["numerator"], factor["denominator"])
        amount = exact_integer(base * session.multiplier * self.unit, "word material")
        if not completed or confirmation:
            amount = 0
        self.districts[session.district_id].queue_micro += amount
        self.lifetime["generated_micro"] += amount
        if completed and not confirmation:
            self.lifetime["completed_words"] += 1
        self.fact_ledger[key] = fingerprint
        return {"applied": True, "generated_micro": str(amount),
                "district_id": session.district_id,
                "session_multiplier": rational_json(session.multiplier)}

    def ship_cargo(self, session_id: str, fact_sequence: int, score_sum: int,
                   cargo_count: int, reason: str, *, city_id: str | None = None,
                   at_ms: int | None = None) -> dict[str, Any]:
        self._event_time(at_ms)
        require_int(score_sum, "score_sum")
        require_int(cargo_count, "cargo_count")
        cfg = self.config["material_generation"]
        if reason not in cfg["shipment_reasons"]:
            raise EconomyError("unknown shipment reason")
        if cargo_count > cfg["maximum_cargo_count"]:
            raise EconomyError("too many cargo items")
        if reason == "manual" and not 1 <= cargo_count <= 4:
            raise EconomyError("manual shipment requires 1 to 4 items")
        if reason == "full" and cargo_count != 5:
            raise EconomyError("full shipment requires 5 items")
        if reason in {"deadline", "skip"} and not 1 <= cargo_count <= 5:
            raise EconomyError("deadline or skip shipment requires completed cargo")
        if cargo_count == 0 and score_sum:
            raise EconomyError("empty cargo cannot carry a score")
        payload = {"kind": "CargoShipped", "score_sum": score_sum,
                   "cargo_count": cargo_count, "reason": reason}
        key, fingerprint, session = self._fact(session_id, fact_sequence, city_id, payload)
        if key is None:
            return {"applied": False, "reason": fingerprint, "generated_micro": "0"}
        bonus = score_sum * cargo_count // cfg["bonus_divisor"]
        factor = cfg["bonus_material_per_point"]
        amount = exact_integer(Fraction(bonus * factor["numerator"], factor["denominator"])
                               * session.multiplier * self.unit, "bonus material")
        self.districts[session.district_id].queue_micro += amount
        self.lifetime["generated_micro"] += amount
        economic = cargo_count > 0
        legacy = reason in cfg["legacy_achievement_shipment_reasons"]
        self.lifetime["economic_shipments"] += int(economic)
        self.lifetime["legacy_shipments"] += int(legacy)
        self.fact_ledger[key] = fingerprint
        return {"applied": True, "bonus_points": bonus, "generated_micro": str(amount),
                "legacy_delivery_counted": legacy, "district_id": session.district_id}

    def development_cost(self, district_id: str, target_stage: int) -> dict[str, int]:
        if target_stage not in self.stage_config or district_id not in self.district_config:
            raise EconomyError("unknown development stage or district")
        cfg = self.stage_config[target_stage]
        mult = self.district_config[district_id]["cost_multiplier"]
        return {"materials_micro": int(cfg["base_materials_micro"]) * mult,
                "coins_micro": int(cfg["base_coins_micro"]) * mult}

    def start_plan(self, district_id: str, *, at_ms: int | None = None) -> dict[str, Any]:
        self._event_time(at_ms)
        self._require_idle()
        d = self._district(district_id)
        if not d.open or d.plan is not None or d.stage >= self.config["development"]["maximum_stage"]:
            raise EconomyError("district cannot start a new plan")
        cost = self.development_cost(district_id, d.stage + 1)
        if self.coins_micro < cost["coins_micro"]:
            raise EconomyError("insufficient coins for plan")
        self.coins_micro -= cost["coins_micro"]
        d.plan = Plan(d.stage + 1, cost["materials_micro"], paid_coins_micro=cost["coins_micro"])
        completed = self._settle_plans()
        return {"paid_coins_micro": str(cost["coins_micro"]), "completed": completed}

    def pause_plan(self, district_id: str, *, at_ms: int | None = None) -> None:
        self._event_time(at_ms)
        self._require_idle()
        p = self._district(district_id).plan
        if p is None:
            raise EconomyError("no plan to pause")
        p.paused = True

    def resume_plan(self, district_id: str, *, at_ms: int | None = None) -> list[dict[str, Any]]:
        self._event_time(at_ms)
        self._require_idle()
        p = self._district(district_id).plan
        if p is None:
            raise EconomyError("no plan to resume")
        p.paused = False
        return self._settle_plans()

    def open_district(self, district_id: str, *, at_ms: int | None = None) -> None:
        self._event_time(at_ms)
        self._require_idle()
        d = self._district(district_id)
        cfg = self.district_config[district_id]
        if d.open:
            raise EconomyError("district is already open")
        if sum(x.stage for x in self.districts.values()) < cfg["unlock_stage_sum"]:
            raise EconomyError("current development stage sum is too low")
        cost = cfg["unlock_coins"] * self.unit
        if self.coins_micro < cost:
            raise EconomyError("insufficient coins to open district")
        self.coins_micro -= cost
        d.open = True
        d.crews = self.config["initial"]["crews_per_open_route"]

    def next_price_coins(self, kind: str, current: int, district_id: str | None = None) -> int:
        if kind not in {"packaging", "crews", "shops"}:
            raise EconomyError("unknown equipment kind")
        require_int(current, "current")
        cfg = self.config["equipment"][kind]
        if current >= cfg["maximum"] or (kind == "crews" and current < 1):
            raise EconomyError("no next price at this ownership count")
        mult = 1
        if kind != "packaging":
            if district_id not in self.district_config:
                raise EconomyError("district_id is required")
            mult = self.district_config[district_id]["cost_multiplier"]
        p = cfg["price"]
        exponent = current + p["exponent_offset"]
        return ceil_div(p["base_coins"] * mult * p["growth_numerator"] ** exponent,
                        p["growth_denominator"] ** exponent)

    def quote_purchase(self, kind: str, quantity: int | str = 1,
                       district_id: str | None = None) -> dict[str, Any]:
        if kind not in {"packaging", "crews", "shops"}:
            raise EconomyError("unknown equipment kind")
        if quantity != "max":
            require_int(quantity, "quantity", 1)
        if quantity not in self.config["equipment"]["purchase_quantities"]:
            raise EconomyError("quantity must be 1, 10 or max")
        cfg = self.config["equipment"][kind]
        if kind == "packaging":
            current, cap = self.packaging_level, cfg["maximum"]
        else:
            d = self._district(district_id)
            if not d.open:
                raise EconomyError("district is not open")
            current = d.crews if kind == "crews" else d.shops
            cap = cfg["maximum"] if kind == "crews" else (self.stage_config[d.stage]["shop_cap"] if d.stage else 0)
        requested = cap - current if quantity == "max" else quantity
        limit = min(requested, cap - current)
        count = total = 0
        prices = []
        for offset in range(limit):
            p = self.next_price_coins(kind, current + offset, district_id)
            if (total + p) * self.unit > self.coins_micro:
                break
            prices.append(p)
            total += p
            count += 1
        after = current + count
        quote = {"kind": kind, "district_id": district_id, "quantity": quantity,
                 "count": count, "requested_count": requested, "current": current,
                 "after": after, "cap": cap, "prices_coins": prices,
                 "total_cost_coins": total, "total_cost_micro": str(total * self.unit),
                 "limited_by_cap": requested > cap - current,
                 "limited_by_funds": count < limit}
        if kind == "packaging":
            quote["before_multiplier"] = rational_json(self.material_multiplier())
            quote["after_multiplier"] = rational_json(self.packaging_multiplier(after) * self.research_multiplier("materials"))
        elif kind == "crews":
            quote.update({
                "before_per_second_micro": str(self.transport_per_second_micro(district_id)),
                "after_per_second_micro": str(self.transport_per_second_micro(district_id, crews=after)),
                "queue_micro": str(self.districts[district_id].queue_micro),
                "before_wait_ms": self.wait_ms(district_id),
                "after_wait_ms": self.wait_ms(district_id, crews=after),
                "wait_assumption": "no_additional_arrivals",
            })
        else:
            quote["before_per_second_micro"] = str(self.shop_income_per_second_micro(district_id))
            quote["after_per_second_micro"] = str(self.shop_income_per_second_micro(district_id, shops=after))
        return quote

    def purchase(self, kind: str, quantity: int | str = 1, district_id: str | None = None,
                 *, at_ms: int | None = None) -> dict[str, Any]:
        self._event_time(at_ms)
        self._require_idle()
        quote = self.quote_purchase(kind, quantity, district_id)
        self.coins_micro -= int(quote["total_cost_micro"])
        if kind == "packaging":
            self.packaging_level = quote["after"]
        elif kind == "crews":
            self.districts[district_id].crews = quote["after"]
        else:
            self.districts[district_id].shops = quote["after"]
        self.assert_invariants()
        return quote

    def buy_railway(self, district_id: str, *, at_ms: int | None = None) -> dict[str, str]:
        self._event_time(at_ms)
        self._require_idle()
        d = self._district(district_id)
        cfg = self.config["railway"]
        if not d.open or d.railway or d.stage < cfg["minimum_stage"] or d.crews < cfg["minimum_crews"]:
            raise EconomyError("railway prerequisites are not met")
        mult = self.district_config[district_id]["cost_multiplier"]
        coins = cfg["base_coins"] * mult * self.unit
        materials = int(cfg["base_materials_micro"]) * mult
        if self.coins_micro < coins or d.stock_micro < materials:
            raise EconomyError("railway needs enough coins and unreserved stock")
        self.coins_micro -= coins
        d.stock_micro -= materials
        d.railway = True
        return {"paid_coins_micro": str(coins), "paid_materials_micro": str(materials)}

    def buy_synergy(self, synergy_id: str, *, at_ms: int | None = None) -> None:
        self._event_time(at_ms)
        self._require_idle()
        if synergy_id not in self.synergy_config or synergy_id in self.synergies:
            raise EconomyError("unknown or already owned synergy")
        cfg = self.synergy_config[synergy_id]
        if any(self.districts[d].stage < stage for d, stage in cfg["requires"].items()):
            raise EconomyError("synergy stage prerequisites are not met")
        coins = cfg["cost_coins"] * self.unit
        if self.coins_micro < coins:
            raise EconomyError("insufficient coins for synergy")
        self.coins_micro -= coins
        self.synergies.add(synergy_id)

    def buy_research(self, kind: str, *, at_ms: int | None = None) -> dict[str, Any]:
        self._event_time(at_ms)
        self._require_idle()
        if kind not in self.research:
            raise EconomyError("unknown research")
        rank = self.research[kind]
        if rank >= self.config["research"]["maximum_rank"]:
            raise EconomyError("research is at maximum rank")
        cost = self.config["research"]["next_rank_cost_blueprints"][rank]
        if self.blueprints < cost:
            raise EconomyError("insufficient blueprints")
        before = self.research_multiplier(kind)
        self.blueprints -= cost
        self.research[kind] += 1
        return {"kind": kind, "cost_blueprints": cost, "rank": rank + 1,
                "before_multiplier": rational_json(before),
                "after_multiplier": rational_json(self.research_multiplier(kind))}

    def new_city_preview(self, research_kind: str | None = None) -> dict[str, Any]:
        cfg = self.config["new_city"]
        threshold = int(cfg["minimum_arrived_micro"])
        level = math.isqrt(self.city_arrived_micro // threshold)
        reward = cfg["reward_unit_blueprints"] * level
        next_threshold = threshold * (level + 1) ** 2
        ready_stages = all(d.stage >= cfg["minimum_stage_each_district"] for d in self.districts.values())
        base_first = Fraction(int(self.stage_config[1]["base_materials_micro"]), self.unit)
        result = {
            "eligible": ready_stages and self.city_arrived_micro >= threshold,
            "stage_requirement_met": ready_stages, "reward_blueprints": reward,
            "arrived_micro": str(self.city_arrived_micro),
            "next_reward_threshold_micro": str(next_threshold),
            "remaining_to_next_reward_micro": str(next_threshold - self.city_arrived_micro),
            "next_reward_blueprints": cfg["reward_unit_blueprints"] * (level + 1),
            "first_building_base_materials": rational_json(base_first / self.research_multiplier("materials")),
            "lose": {"coins_micro": str(self.coins_micro), "packaging_level": self.packaging_level,
                     "districts": {ident: self._district_snapshot(d) for ident, d in self.districts.items()},
                     "synergies": sorted(self.synergies)},
            "keep": {"research": dict(self.research), "unspent_blueprints": self.blueprints,
                     "persistent": copy.deepcopy(self.persistent), "lifetime": self._micro_dict(self.lifetime)},
        }
        if research_kind is not None:
            if research_kind not in self.research:
                raise EconomyError("unknown research")
            rank = self.research[research_kind]
            max_rank = self.config["research"]["maximum_rank"]
            result["research_preview"] = {
                "kind": research_kind, "current_rank": rank,
                "next_rank": min(max_rank, rank + 1),
                "cost_blueprints": self.config["research"]["next_rank_cost_blueprints"][rank] if rank < max_rank else None,
                "current_multiplier": rational_json(self.research_multiplier(research_kind)),
                "next_multiplier": rational_json(self.research_multiplier(research_kind, min(max_rank, rank + 1))),
            }
        return result

    def start_new_city(self, *, confirmed: bool = False, location: str = "HOME",
                       landscape: str = "riverside", at_ms: int | None = None) -> dict[str, Any]:
        self._event_time(at_ms)
        self._require_idle()
        cfg = self.config["new_city"]
        if not confirmed or location not in cfg["allowed_locations"]:
            raise EconomyError("confirmed new city requires HOME or RESULT")
        if landscape not in cfg["landscapes"]:
            raise EconomyError("unknown landscape")
        preview = self.new_city_preview()
        if not preview["eligible"]:
            raise EconomyError("new-city requirements are not met")
        reward = preview["reward_blueprints"]
        old_city = self.city_id
        self.blueprints += reward
        self.lifetime["cities_restarted"] += 1
        self.city_sequence += 1
        self.city_id = f"city-{self.city_sequence}"
        self.landscape = landscape
        self._reset_city()
        return {"old_city_id": old_city, "city_id": self.city_id, "earned_blueprints": reward,
                "unspent_blueprints": self.blueprints}

    @staticmethod
    def _micro_dict(values: dict[str, Any]) -> dict[str, Any]:
        return {key: str(value) if key.endswith("_micro") else value for key, value in values.items()}

    def _district_snapshot(self, d: District) -> dict[str, Any]:
        result = self._micro_dict(asdict(d))
        if d.plan is not None:
            result["plan"] = self._micro_dict(asdict(d.plan))
        return result

    def snapshot(self) -> dict[str, Any]:
        self.assert_invariants()
        return {
            "schema_version": "1.0.0", "economy_version": self.config["economy_version"],
            "clock_ms": self.clock_ms, "saved_wall_ms": self.saved_wall_ms,
            "city_sequence": self.city_sequence, "city_id": self.city_id, "landscape": self.landscape,
            "coins_micro": str(self.coins_micro), "city_arrived_micro": str(self.city_arrived_micro),
            "packaging_level": self.packaging_level, "blueprints": self.blueprints,
            "research": dict(self.research), "synergies": sorted(self.synergies),
            "districts": {ident: self._district_snapshot(d) for ident, d in self.districts.items()},
            "active_session": self._micro_dict(asdict(self.active_session)) if self.active_session else None,
            "last_session_summary": copy.deepcopy(self.last_session_summary),
            "used_session_ids": sorted(self.used_session_ids), "fact_ledger": dict(self.fact_ledger),
            "construction_history": copy.deepcopy(self.construction_history),
            "persistent": copy.deepcopy(self.persistent), "lifetime": self._micro_dict(self.lifetime),
        }

    @classmethod
    def from_snapshot(cls, state: dict[str, Any], config_path: str | Path | None = None) -> "EconomyModel":
        model = cls(config_path)
        if state["economy_version"] != model.config["economy_version"]:
            raise EconomyError("save and economy configuration versions differ")
        for key in ("clock_ms", "saved_wall_ms", "city_sequence", "packaging_level", "blueprints"):
            setattr(model, key, require_int(state[key], key))
        for key in ("city_id", "landscape"):
            setattr(model, key, state[key])
        for key in ("coins_micro", "city_arrived_micro"):
            setattr(model, key, parse_micro(state[key]))
        model.research = dict(state["research"])
        model.synergies = set(state["synergies"])
        model.districts = {}
        for ident, values in state["districts"].items():
            data = dict(values)
            for key in ("queue_micro", "stock_micro", "arrived_micro"):
                data[key] = parse_micro(data[key])
            if data["plan"] is not None:
                plan = dict(data["plan"])
                for key in ("required_micro", "reserved_micro", "paid_coins_micro"):
                    plan[key] = parse_micro(plan[key])
                data["plan"] = Plan(**plan)
            model.districts[ident] = District(**data)
        session_data = copy.deepcopy(state["active_session"])
        if session_data:
            for key in list(session_data):
                if key.endswith("_micro"):
                    session_data[key] = parse_micro(session_data[key])
        model.active_session = Session(**session_data) if session_data else None
        model.last_session_summary = copy.deepcopy(state.get("last_session_summary"))
        model.used_session_ids = set(state["used_session_ids"])
        model.fact_ledger = dict(state["fact_ledger"])
        model.construction_history = copy.deepcopy(state["construction_history"])
        model.persistent = copy.deepcopy(state["persistent"])
        model.lifetime = {key: parse_micro(value) if key.endswith("_micro") else require_int(value, key)
                          for key, value in state["lifetime"].items()}
        model.assert_invariants()
        return model

    def save(self, path: str | Path) -> None:
        """Write resources and the last credited wall time in one atomic JSON file."""
        target = Path(path)
        temporary = target.with_name(target.name + ".tmp")
        temporary.write_text(json.dumps(self.snapshot(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        temporary.replace(target)

    def assert_invariants(self) -> None:
        for key in ("coins_micro", "city_arrived_micro", "blueprints", "packaging_level", "clock_ms", "saved_wall_ms"):
            require_int(getattr(self, key), key)
        if self.packaging_level > self.config["equipment"]["packaging"]["maximum"]:
            raise EconomyError("packaging cap exceeded")
        if set(self.districts) != set(self.district_config):
            raise EconomyError("district set differs from configuration")
        if set(self.research) != {r["id"] for r in self.config["research"]["types"]}:
            raise EconomyError("research set differs from configuration")
        for rank in self.research.values():
            if require_int(rank, "research rank") > self.config["research"]["maximum_rank"]:
                raise EconomyError("research cap exceeded")
        for ident, d in self.districts.items():
            for key in ("stage", "shops", "crews", "queue_micro", "stock_micro", "arrived_micro"):
                require_int(getattr(d, key), f"{ident}.{key}")
            if d.stage > self.config["development"]["maximum_stage"]:
                raise EconomyError("development cap exceeded")
            if d.open and not 1 <= d.crews <= self.config["equipment"]["crews"]["maximum"]:
                raise EconomyError("open route has invalid crew count")
            if not d.open and any((d.crews, d.stage, d.shops, d.queue_micro, d.stock_micro, d.plan)):
                raise EconomyError("closed route has active resources")
            cap = self.stage_config[d.stage]["shop_cap"] if d.stage else 0
            if d.shops > cap:
                raise EconomyError("shop cap exceeded")
            if d.plan is not None:
                p = d.plan
                if p.target_stage != d.stage + 1:
                    raise EconomyError("plan does not target the next stage")
                expected = self.development_cost(ident, p.target_stage)
                if p.required_micro != expected["materials_micro"] or p.paid_coins_micro != expected["coins_micro"]:
                    raise EconomyError("plan cost differs from configuration")
                if not 0 <= p.reserved_micro <= p.required_micro:
                    raise EconomyError("reservation is out of range")


def replay_events(model: EconomyModel, events: list[dict[str, Any]]) -> list[Any]:
    """Execute an explicit JSON event sequence; absolute at_ms values may be retried."""
    allowed = {
        "advance", "advance_to", "restore_at", "begin_session", "end_session",
        "complete_word", "ship_cargo", "start_plan", "pause_plan", "resume_plan",
        "open_district", "purchase", "buy_railway", "buy_synergy", "buy_research", "start_new_city",
    }
    receipts = []
    for event in events:
        name = event.get("type")
        if name not in allowed:
            raise EconomyError(f"unsupported event: {name}")
        kwargs = {key: value for key, value in event.items() if key != "type"}
        receipts.append(getattr(model, name)(**kwargs))
    return receipts


def reference_example(config_path: str | Path | None = None) -> dict[str, Any]:
    model = EconomyModel(config_path)
    model.begin_session("example")
    model.complete_word("example", 1, 30, city_id=model.city_id)
    model.end_session()
    result = model.advance(60_000)
    return {"assumption": "30 materials queued at t=0; one crew; no additional supply",
            "advance": result, "state": model.snapshot(),
            "purchase_preview": model.quote_purchase("packaging", 1)}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("example", help="30 materials / 60 seconds reference case")
    check = sub.add_parser("validate", help="run deterministic validation cases")
    check.add_argument("--report", type=Path)
    sub.add_parser("balance", help="print assumptions, early progression and total costs")
    replay = sub.add_parser("replay", help="replay JSON events")
    replay.add_argument("events", type=Path)
    replay.add_argument("--load-state", type=Path)
    replay.add_argument("--save-state", type=Path)
    args = parser.parse_args()
    try:
        if args.command == "example":
            result = reference_example(args.config)
        elif args.command == "validate":
            result = run_validation(args.config)
            if args.report:
                args.report.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        elif args.command == "balance":
            result = balance_analysis(args.config)
        else:
            if args.load_state:
                model = EconomyModel.from_snapshot(json.loads(args.load_state.read_text(encoding="utf-8")), args.config)
            else:
                model = EconomyModel(args.config)
            events = json.loads(args.events.read_text(encoding="utf-8"))
            result = {"receipts": replay_events(model, events), "state": model.snapshot()}
            if args.save_state:
                model.save(args.save_state)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 1 if args.command == "validate" and result["failed"] else 0
    except (EconomyError, OSError, KeyError, TypeError, json.JSONDecodeError) as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=False), file=sys.stderr)
        return 2


# Numerical validation and declared-assumption scenarios are below the model.


def simulate_input_profile(name: str, interval_ms: int, clean_pattern: list[bool],
                           mistakes_per_bad_word: int, config_path=None) -> dict[str, Any]:
    """Two 90 s sessions; the last word is at 89 s, strictly before the deadline."""
    m = EconomyModel(config_path)
    completion_offsets = list(range(interval_ms, 90_001, interval_ms))
    completion_offsets[-1] = 89_000
    if not all(0 <= offset < 90_000 for offset in completion_offsets):
        raise EconomyError("profile completion must precede the 90-second deadline")
    word_events = []
    supplied_at = supplied_words = supplied_session = None
    first_summary = None
    first_queue_wait = 0
    completed_words = 0
    clean_words_first = 0
    first_errors = 0
    cargo_losses = []
    shipment_facts = []
    for session_index in range(2):
        sid = f"{name}-{session_index + 1}"
        m.begin_session(sid)
        cargo = score = sequence = 0
        start = session_index * 90_000
        for local_index, offset in enumerate(completion_offsets):
            completed_words += 1
            clean = clean_pattern[(completed_words - 1) % len(clean_pattern)]
            mistakes = 0 if clean else mistakes_per_bad_word
            sequence += 1
            m.complete_word(sid, sequence, 5, city_id=m.city_id, mistakes=mistakes,
                            at_ms=start + offset)
            word_events.append(m.clock_ms)
            if session_index == 0:
                clean_words_first += int(clean)
                first_errors += mistakes
            if clean:
                cargo += 1
                score += 50
            else:
                # An error loses the held cargo; the completed word's material stays.
                cargo_losses.append({"session": session_index + 1, "word": completed_words,
                                     "clock_ms": m.clock_ms, "discarded_count": cargo,
                                     "discarded_score": score})
                cargo = score = 0
            if cargo == 5:
                sequence += 1
                shipment = m.ship_cargo(sid, sequence, score, cargo, "full", city_id=m.city_id)
                shipment_facts.append({"session": session_index + 1, "clock_ms": m.clock_ms,
                                       "reason": "full", "score_sum": score,
                                       "cargo_count": cargo, **shipment})
                cargo = score = 0
            if supplied_at is None and m.lifetime["generated_micro"] >= 30 * m.unit:
                supplied_at, supplied_words, supplied_session = m.clock_ms, completed_words, session_index + 1
        m.advance_to(start + 90_000)
        if cargo:
            sequence += 1
            shipment = m.ship_cargo(sid, sequence, score, cargo, "deadline", city_id=m.city_id)
            shipment_facts.append({"session": session_index + 1, "clock_ms": m.clock_ms,
                                   "reason": "deadline", "score_sum": score,
                                   "cargo_count": cargo, **shipment})
        if supplied_at is None and m.lifetime["generated_micro"] >= 30 * m.unit:
            supplied_at, supplied_words, supplied_session = m.clock_ms, completed_words, session_index + 1
        summary = m.end_session()
        if session_index == 0:
            first_summary = summary
            first_queue_wait = m.wait_ms("residential")
    m.advance(m.wait_ms("residential"))
    first_building = m.construction_history[0]["clock_ms"]
    words_per_session = len(completion_offsets)
    return {
        "name": name, "assumptions": {
            "session_ms": 90_000, "consecutive_sessions_without_break": True,
            "base_length_every_word": 5, "nominal_completion_interval_ms": interval_ms,
            "completion_times_ms": completion_offsets, "last_completion_ms": 89_000,
            "completed_words_per_session": words_per_session,
            "clean_pattern": clean_pattern, "mistakes_per_bad_word": mistakes_per_bad_word,
            "mistake_discards_all_held_cargo": True,
            "clean_words_in_first_session": clean_words_first,
            "mistakes_in_first_session": first_errors,
            "manual_shipments": 0, "full_at_five_clean_words": True,
            "deadline_ships_remaining_clean_cargo": True,
            "packaging_level": 0, "research_rank": 0, "crews": 1,
            "purchases": False,
        },
        "first_building_sufficient_material_at_ms": supplied_at,
        "completed_words_needed_to_generate_30": supplied_words,
        "sessions_needed_to_generate_30": supplied_session,
        "first_building_completed_at_ms": first_building,
        "completed_words_by_construction": sum(t <= first_building for t in word_events),
        "first_session": first_summary,
        "first_session_end_queue_clear_ms_no_more_input": first_queue_wait,
        "cargo_losses": cargo_losses, "shipment_facts": shipment_facts,
    }


def balance_analysis(config_path=None) -> dict[str, Any]:
    m = EconomyModel(config_path)
    unit = m.unit
    district_totals = []
    for ident, cfg in m.district_config.items():
        material = sum(m.development_cost(ident, s)["materials_micro"] for s in m.stage_config)
        coins = sum(m.development_cost(ident, s)["coins_micro"] for s in m.stage_config)
        mult = cfg["cost_multiplier"]
        min_crew_coins = sum(m.next_price_coins("crews", n, ident) for n in range(1, 10))
        district_totals.append({
            "id": ident, "name": cfg["name"], "multiplier": mult,
            "stage_1_to_5_materials_micro": str(material),
            "stage_1_to_5_coins_micro": str(coins),
            "unlock_coins_micro": str(cfg["unlock_coins"] * unit),
            "railway_materials_micro": str(int(m.config["railway"]["base_materials_micro"]) * mult),
            "railway_coins_micro": str(m.config["railway"]["base_coins"] * mult * unit),
            "crews_1_to_10_coins_micro": str(min_crew_coins * unit),
        })
    first = EconomyModel(config_path)
    first.districts["residential"].queue_micro = 30 * unit
    first.advance(7_500)
    before_purchase = first.coins_micro
    purchase = first.purchase("packaging", 1)
    first.begin_session("next-session")
    next_word = first.complete_word("next-session", 1, 3, city_id=first.city_id)
    first.end_session()
    waiting = EconomyModel(config_path)
    waiting.districts["residential"].queue_micro = 600 * unit
    waiting.coins_micro = 100 * unit
    queue_preview = waiting.quote_purchase("crews", 1, "residential")
    research_rows = []
    for rank in range(6):
        factor = m.research_multiplier("materials", rank)
        research_rows.append({
            "rank": rank, "next_price_blueprints": rank + 1 if rank < 5 else None,
            "cumulative_price_blueprints": rank * (rank + 1) // 2,
            "multiplier": rational_json(factor),
            "first_building_base_materials": rational_json(Fraction(30) / factor),
        })
    full = EconomyModel(config_path)
    full.research = {kind: 5 for kind in full.research}
    full.packaging_level = 50
    full.synergies = set(full.synergy_config)
    for d in full.districts.values():
        d.open, d.stage, d.shops, d.crews, d.railway, d.plan = True, 5, 50, 50, True, None
    totals = {key: str(sum(int(row[key]) for row in district_totals)) for key in (
        "stage_1_to_5_materials_micro", "stage_1_to_5_coins_micro", "unlock_coins_micro",
        "railway_materials_micro", "railway_coins_micro", "crews_1_to_10_coins_micro")}
    totals["development_plus_railway_materials_micro"] = str(
        int(totals["stage_1_to_5_materials_micro"]) + int(totals["railway_materials_micro"]))
    totals["development_unlock_railway_and_required_crews_coins_micro"] = str(sum(int(totals[k]) for k in (
        "stage_1_to_5_coins_micro", "unlock_coins_micro", "railway_coins_micro", "crews_1_to_10_coins_micro")))
    return {
        "scope": "Declared deterministic input assumptions; not measured play time or a test of enjoyment.",
        "profiles": [
            simulate_input_profile("低速・誤打あり", 30_000, [False, False, True], 5, config_path),
            simulate_input_profile("標準仮定", 7_500, [True, True, True, True, False], 1, config_path),
            simulate_input_profile("高速仮定", 2_000, [True], 0, config_path),
        ],
        "first_purchase_example": {
            "initial_queued_micro": str(30 * unit), "construction_at_ms": 7_500,
            "coins_before_purchase_micro": str(before_purchase), "purchase": purchase,
            "coins_after_purchase_micro": str(first.coins_micro),
            "next_word_L3_materials_micro": next_word["generated_micro"],
            "shop_income_per_second_micro": str(first.total_income_per_second_micro()),
        },
        "transport_purchase_example": queue_preview,
        "early_stalls": {
            "stage2_coin_cost_micro": str(100 * unit),
            "stage2_incremental_materials_micro": str(150 * unit),
            "after_first_building_coins_micro": str(60 * unit),
            "coins_missing_without_equipment_micro": str(40 * unit),
            "additional_arrivals_for_40_coins_micro": str(20 * unit),
            "passive_only_wait_for_40_coins_ms": 400_000,
            "coins_after_first_packaging_micro": str(10 * unit),
            "passive_only_wait_for_90_coins_ms": 900_000,
            "material_generation_without_input_micro": "0",
            "remaining_coins_after_residential_stage2_and_market_open_excluding_shop_income_micro": str(110 * unit),
        },
        "research": research_rows,
        "first_three_blueprints": {
            "split_ranks": {"materials": 1, "logistics": 1, "commerce": 1},
            "split_first_building_base_materials": {"numerator": 24, "denominator": 1},
            "split_transport_per_second_micro": str(5 * unit),
            "split_first_shop_income_per_second_micro": str(unit // 8),
            "concentrated_material_rank": 2,
            "concentrated_first_building_base_materials": {"numerator": 20, "denominator": 1},
            "rank2_cost_blueprints": 3,
        },
        "district_totals": district_totals, "totals": totals,
        "all_districts_stage3_materials_micro": str(sum(m.development_cost(ident, s)["materials_micro"]
                                                        for ident in m.districts for s in (1, 2, 3))),
        "new_city_examples": [
            {"arrived_materials": amount, "blueprints": 3 * math.isqrt(amount // 100000)}
            for amount in (99999, 100000, 399999, 400000, 899999, 900000, 1600000)
        ],
        "maximum_rates": {
            "materials_multiplier": rational_json(full.material_multiplier()),
            "one_route_materials_per_second_micro": str(full.transport_per_second_micro("residential")),
            "all_shops_coins_per_second_micro": str(full.total_income_per_second_micro()),
            "eight_hour_shop_coins_micro": str(full.total_income_per_second_micro() * 8 * 3600),
        },
    }


def run_validation(config_path=None) -> dict[str, Any]:
    results = []

    def check(name, callback):
        try:
            evidence = callback()
            results.append({"name": name, "passed": True, "evidence": evidence})
        except Exception as exc:
            results.append({"name": name, "passed": False,
                            "error": f"{type(exc).__name__}: {exc}"})

    def eq(actual, expected):
        if actual != expected:
            raise AssertionError(f"actual={actual!r}; expected={expected!r}")
        return actual

    def reject(callback):
        try:
            callback()
        except EconomyError:
            return "rejected"
        raise AssertionError("operation was not rejected")

    def model():
        return EconomyModel(config_path)

    def staged(stage=1, shops=1):
        m = model()
        d = m.districts["residential"]
        d.stage, d.shops, d.plan = stage, shops, None
        return m

    def fact_fixture(level=0, rank=0, mode="normal"):
        m = model()
        m.packaging_level = level
        m.research["materials"] = rank
        m.begin_session("facts", mode=mode)
        return m

    def known_material_examples():
        a = fact_fixture(1)
        eq(a.complete_word("facts", 1, 3, city_id=a.city_id)["generated_micro"], "3750000")
        b = fact_fixture()
        receipt = b.ship_cargo("facts", 1, 230, 3, "manual", city_id=b.city_id)
        eq((receipt["bonus_points"], receipt["generated_micro"]), (138, "13800000"))
        c = fact_fixture(10)
        eq(c.ship_cargo("facts", 1, 230, 3, "manual", city_id=c.city_id)["generated_micro"], "96600000")
        return {"L3_packaging1": "3.75", "S230_k3_bonus_points": 138,
                "bonus_materials": "13.8", "packaging10_bonus_materials": "96.6"}
    check("exact_fixed_point_material_examples", known_material_examples)

    check("packaging_milestones_0_10_25_50", lambda: eq(
        [str(model().packaging_multiplier(n)) for n in (0, 10, 25, 50)], ["1", "7", "29", "108"]))

    def fractional_accumulation():
        m = fact_fixture(1, 1)
        for i in range(16):
            m.complete_word("facts", i, 1, city_id=m.city_id, mistakes=4)
        eq(m.districts["residential"].queue_micro, 25_000_000)
        return "16 × 1.5625 = 25 exactly; mistakes do not reduce base material"
    check("no_per_word_truncation_and_mistakes_keep_material", fractional_accumulation)

    def zero_material_words():
        m = fact_fixture()
        a = m.complete_word("facts", 1, 1, city_id=m.city_id, confirmation=True)
        b = m.complete_word("facts", 2, 8, city_id=m.city_id, completed=False)
        eq((a["generated_micro"], b["generated_micro"], m.coins_micro), ("0", "0", 0))
        return [a, b]
    check("confirmation_and_unfinished_words_generate_zero", zero_material_words)

    def all_modes():
        values = {}
        for mode in model().config["material_generation"]["modes"]:
            m = fact_fixture(mode=mode)
            values[mode] = m.complete_word("facts", 1, 5, city_id=m.city_id, mistakes=10)["generated_micro"]
        eq(set(values.values()), {"5000000"})
        return values
    check("normal_skip_practice_review_intro_share_base_material_rule", all_modes)

    def shipment_kinds():
        actual = {}
        for reason, count in (("manual", 3), ("full", 5), ("deadline", 3), ("skip", 3)):
            m = fact_fixture()
            r = m.ship_cargo("facts", 1, 230, count, reason, city_id=m.city_id)
            actual[reason] = {"bonus_points": r["bonus_points"], "legacy": r["legacy_delivery_counted"]}
        eq(actual, {"manual": {"bonus_points": 138, "legacy": True},
                    "full": {"bonus_points": 230, "legacy": True},
                    "deadline": {"bonus_points": 138, "legacy": False},
                    "skip": {"bonus_points": 138, "legacy": False}})
        return actual
    check("shipment_bonus_and_legacy_achievement_scope", shipment_kinds)

    def unsupported_shipment_reasons():
        rejected = []
        for reason in ("early_exit", "automatic", "timeout"):
            m = fact_fixture()
            before = m.snapshot()
            reject(lambda: m.ship_cargo("facts", 1, 230, 3, reason, city_id=m.city_id))
            eq(m.snapshot(), before)
            rejected.append(reason)
        return {"rejected_reasons": rejected, "resources_and_ledger_unchanged": True}
    check("only_manual_full_deadline_skip_shipment_reasons_are_accepted", unsupported_shipment_reasons)

    def exit_keeps_base():
        m = fact_fixture()
        m.complete_word("facts", 1, 5, city_id=m.city_id)
        summary = m.end_session()
        eq(m.districts["residential"].queue_micro, 5 * m.unit)
        eq(summary["generated_micro"], "5000000")
        return summary
    check("early_end_retains_words_without_making_bonus", exit_keeps_base)

    def delivery_only_at_arrival():
        m = fact_fixture()
        m.complete_word("facts", 1, 30, city_id=m.city_id)
        eq((m.coins_micro, m.districts["residential"].stage), (0, 0))
        m.advance(7_500)
        eq((m.coins_micro, m.districts["residential"].stage, m.districts["residential"].shops),
           (60 * m.unit, 1, 1))
        return {"generated_coins": 0, "arrival_coins": 60, "stage": 1, "shops": 1}
    check("arrival_30_completes_first_building_and_pays_once", delivery_only_at_arrival)

    def sixty_seconds():
        m = model()
        m.districts["residential"].queue_micro = 30 * m.unit
        result = m.advance(60_000)
        eq(m.coins_micro, 65_250_000)
        eq(m.construction_history[0]["clock_ms"], 7_500)
        eq([s["end_ms"] for s in result["segments"]], [7_500, 60_000])
        return {"completion_ms": 7500, "delivery_coins": "60", "shop_coins": "5.25", "total_coins": "65.25"}
    check("Q30_rate4_60seconds_is_65_25_coins", sixty_seconds)

    def later_stage_switch():
        m = staged()
        d = m.districts["residential"]
        d.plan = Plan(2, 150 * m.unit, paid_coins_micro=100 * m.unit)
        d.queue_micro = 150 * m.unit
        result = m.advance(60_000)
        eq((d.stage, m.coins_micro, result["shop_coins_micro"]), (2, 308_250_000, "8250000"))
        eq(m.construction_history[0]["clock_ms"], 37_500)
        return "37.5 s × 0.1 + 22.5 s × 0.2 + 150 × 2 = 308.25 coins"
    check("stage2_mid_interval_changes_future_income_only", later_stage_switch)

    def paused_plan():
        m = model()
        d = m.districts["residential"]
        d.queue_micro = 10 * m.unit
        m.advance(2500)
        m.pause_plan("residential")
        d.queue_micro = 20 * m.unit
        m.advance(5000)
        eq((d.stage, d.stock_micro, d.plan.reserved_micro, d.plan.paid_coins_micro),
           (0, 20 * m.unit, 10 * m.unit, 0))
        coin_before = m.coins_micro
        m.resume_plan("residential")
        eq((d.stage, d.stock_micro, d.plan, m.coins_micro), (1, 0, None, coin_before))
        return "paused reservation 10; arrivals become stock 20; resume completes without a second arrival reward"
    check("paused_plan_retains_reservation_and_new_arrivals_stay_stock", paused_plan)

    def railway_reservation():
        m = staged(3)
        d = m.districts["residential"]
        d.crews = 10
        d.plan = Plan(4, 2400 * m.unit, reserved_micro=2000 * m.unit,
                      paid_coins_micro=3000 * m.unit, paused=True)
        d.stock_micro = 499 * m.unit
        m.coins_micro = 10_000 * m.unit
        reject(lambda: m.buy_railway("residential"))
        eq((d.plan.reserved_micro, d.stock_micro, m.coins_micro),
           (2000 * m.unit, 499 * m.unit, 10_000 * m.unit))
        d.stock_micro = 500 * m.unit
        m.buy_railway("residential")
        eq((d.plan.reserved_micro, d.stock_micro, m.coins_micro, m.transport_per_second_micro("residential")),
           (2000 * m.unit, 0, 7000 * m.unit, 320 * m.unit))
        return "reserved 2000 stays untouched; unreserved 500 and 3000 coins purchase railway"
    check("railway_payment_cannot_invade_reserved_material", railway_reservation)

    def offline_cap():
        m = staged()
        r = m.restore_at(36 * 3600 * 1000)
        eq((r["credited_ms"], m.coins_micro, m.clock_ms, m.saved_wall_ms),
           (8 * 3600 * 1000, 2880 * m.unit, 8 * 3600 * 1000, 36 * 3600 * 1000))
        before = m.snapshot()
        m.restore_at(36 * 3600 * 1000)
        eq(m.snapshot(), before)
        m.restore_at(37 * 3600 * 1000)
        eq(m.coins_micro, 3240 * m.unit)
        return "36 h absence credits 8 h; same wall timestamp credits zero; next new hour credits 1 h"
    check("offline_eight_hour_cap_and_same_interval_idempotence", offline_cap)

    def offline_new_construction():
        m = model()
        m.districts["residential"].queue_micro = 30 * m.unit
        r = m.restore_at(9 * 3600 * 1000)
        eq((r["credited_ms"], m.coins_micro, m.construction_history[0]["clock_ms"]),
           (28_800_000, 2_939_250_000, 7_500))
        return "9 h absence credits 8 h: 60 delivery + (28800 - 7.5) × 0.1 = 2939.25 coins"
    check("offline_new_building_credits_only_income_after_its_completion", offline_new_construction)

    def rollback_clock():
        m = staged()
        m.advance(1000)
        before = m.snapshot()
        m.restore_at(900)
        m.advance(-1)
        m.advance_to(500)
        eq(m.snapshot(), before)
        m.restore_at(1100)
        eq(m.coins_micro, 110000)
        return "wall high-water mark prevents rollback double credits; resources never decrease"
    check("negative_elapsed_and_backward_wall_clock", rollback_clock)

    def shop_after_exhaustion():
        m = staged()
        m.districts["residential"].queue_micro = 4 * m.unit
        result = m.advance(60_000)
        eq(m.coins_micro, 14 * m.unit)
        eq(result["shop_coins_micro"], str(6 * m.unit))
        return "4 materials arrive in 1 s, then stores continue; 8 delivery + 6 shop = 14"
    check("shops_continue_after_material_supply_is_exhausted", shop_after_exhaustion)

    def split_equivalence():
        rng = random.Random(20261113)
        checked = 0
        for _ in range(100):
            a = model()
            a.research["logistics"] = rng.randrange(6)
            a.research["commerce"] = rng.randrange(6)
            for ident, d in a.districts.items():
                d.open, d.crews = True, rng.choice([1, 2, 9, 10, 25, 50])
                d.stage = rng.randrange(4)
                d.shops = 0 if d.stage == 0 else rng.randrange(1, a.stage_config[d.stage]["shop_cap"] + 1)
                d.queue_micro = rng.randrange(0, 100_000_000_001)
                d.stock_micro = 0
                costs = a.development_cost(ident, d.stage + 1)
                d.plan = Plan(d.stage + 1, costs["materials_micro"],
                              rng.randrange(costs["materials_micro"]), costs["coins_micro"], rng.choice([True, False]))
            b = EconomyModel.from_snapshot(a.snapshot(), config_path)
            total = rng.randrange(1, 28_800_001)
            cuts = sorted(set([0, total] + [rng.randrange(total + 1) for _ in range(25)]))
            a.advance(total)
            for start, end in zip(cuts, cuts[1:]):
                b.advance(end - start)
            eq(a.snapshot(), b.snapshot())
            checked += 1
        return {"randomized_states": checked, "split_points_per_case_up_to": 25,
                "seed": 20261113, "resource_and_complete_state_comparison": "exact"}
    check("single_and_split_time_progression_match", split_equivalence)

    def millisecond_boundary():
        a = model()
        d = a.districts["residential"]
        d.plan.reserved_micro = 30 * a.unit - 6250
        d.queue_micro = 6250
        b = EconomyModel.from_snapshot(a.snapshot(), config_path)
        a.advance(10)
        b.advance(1)
        b.advance(1)
        b.advance(8)
        eq(a.snapshot(), b.snapshot())
        eq(a.construction_history[0]["clock_ms"], 2)
        eq(a.lifetime["shop_coins_micro"], 800)
        return "6250 micro / 4000 micro per ms completes at ms 2; shop earns only ms 2..10"
    check("submillisecond_threshold_uses_first_reaching_millisecond", millisecond_boundary)

    def price_tables():
        m = model()
        table = m.config["price_tables"]
        values = 0
        for n, p in enumerate(table["packaging_by_current_level"]):
            eq(m.next_price_coins("packaging", n), p)
            values += 1
        for kind, key, start in (("crews", "crews_by_district_current_1_to_49", 1),
                                 ("shops", "shops_by_district_current_0_to_49", 0)):
            for ident, rows in table[key].items():
                for n, p in enumerate(rows, start=start):
                    eq(m.next_price_coins(kind, n, ident), p)
                    values += 1
        eq([m.next_price_coins("packaging", n) for n in range(5)], [50, 59, 70, 83, 97])
        eq(m.next_price_coins("crews", 3, "residential"), 53)
        eq(m.next_price_coins("shops", 1, "residential"), 29)
        eq(values, 644)
        return {"verified_price_cells": values, "integer_power_and_ceiling_only": True}
    check("all_644_price_table_cells_and_known_prices", price_tables)

    def purchases():
        m = model()
        m.coins_micro = 179 * m.unit
        one = m.purchase("packaging", 1)
        eq((one["count"], one["total_cost_coins"], m.packaging_level), (1, 50, 1))
        ten = m.purchase("packaging", 10)
        eq((ten["count"], ten["total_cost_coins"], m.packaging_level, m.coins_micro), (2, 129, 3, 0))
        n = model()
        n.coins_micro = 179 * n.unit
        maximum = n.purchase("packaging", "max")
        eq((maximum["count"], maximum["total_cost_coins"]), (3, 179))
        eq(n.purchase("packaging", 1)["count"], 0)
        return {"one": 1, "ten_affordable": 2, "max_affordable": 3, "empty_wallet": 0}
    check("purchase_1_10_max_respects_actual_affordability", purchases)

    def equipment_caps():
        m = staged(1, 4)
        m.packaging_level = 49
        m.districts["residential"].crews = 49
        m.coins_micro = 10**18
        p = m.purchase("packaging", 10)
        c = m.purchase("crews", 10, "residential")
        s = m.purchase("shops", 10, "residential")
        eq((p["count"], c["count"], s["count"]), (1, 1, 1))
        eq((m.packaging_level, m.districts["residential"].crews, m.districts["residential"].shops), (50, 50, 5))
        eq(m.purchase("shops", "max", "residential")["count"], 0)
        return {"packaging_cap": 50, "crew_cap": 50, "stage1_shop_cap": 5}
    check("equipment_and_stage_specific_store_caps", equipment_caps)

    def all_stage_shop_caps():
        caps = []
        for stage in range(1, 6):
            m = staged(stage)
            m.coins_micro = 10**18
            m.purchase("shops", "max", "residential")
            caps.append(m.districts["residential"].shops)
        return eq(caps, [5, 10, 20, 35, 50])
    check("shop_caps_for_all_five_stages", all_stage_shop_caps)

    def old_material_and_session_multiplier():
        m = fact_fixture()
        m.coins_micro = 100 * m.unit
        m.complete_word("facts", 1, 3, city_id=m.city_id)
        reject(lambda: m.purchase("packaging", 1))
        m.end_session()
        m.purchase("packaging", 1)
        eq(m.districts["residential"].queue_micro, 3 * m.unit)
        m.begin_session("next")
        m.complete_word("next", 1, 3, city_id=m.city_id)
        eq(m.districts["residential"].queue_micro, 6_750_000)
        return "existing 3 stays 3; next session adds 3.75; buying during a session is rejected"
    check("no_revaluation_of_existing_material_and_READY_snapshot", old_material_and_session_multiplier)

    def practice_purchase_rejection():
        m = fact_fixture(mode="practice")
        m.coins_micro = 100 * m.unit
        reject(lambda: m.purchase("packaging", 1))
        m.end_session()
        eq(m.purchase("packaging", 1)["count"], 1)
        return "practice must end before equipment purchase"
    check("practice_session_has_fixed_equipment_snapshot", practice_purchase_rejection)

    def active_plan_investment_regression():
        m = model()
        m.begin_session("active-plan-investment")
        for i in range(1, 11):
            m.complete_word("active-plan-investment", i, 5, city_id=m.city_id,
                            mistakes=1, at_ms=i * 1000)
        m.advance_to(13_500)
        eq((m.coins_micro, m.districts["residential"].stock_micro,
            m.districts["residential"].stage), (100_500_000, 20 * m.unit, 1))
        before = m.snapshot()
        reject(lambda: m.purchase("crews", 1, "residential"))
        reject(lambda: m.start_plan("residential"))
        eq(m.snapshot(), before)
        m.end_session()
        m.start_plan("residential")
        eq((m.coins_micro, m.districts["residential"].plan.reserved_micro),
           (500_000, 20 * m.unit))
        return {"active_session_coins": "100.5", "active_session_free_stock": "20",
                "active_purchase_and_plan_start": "both rejected without mutation",
                "after_session_plan_start_coins": "0.5", "after_session_reserved_material": "20"}
    check("active_session_cannot_invest_100_coins_in_a_plan", active_plan_investment_regression)

    def all_investment_entry_points_require_idle():
        operations = ["packaging", "crews", "shops", "start_plan", "pause_plan", "resume_plan",
                      "open_district", "railway", "synergy", "research", "new_city"]
        verified = []
        for mode in model().config["material_generation"]["modes"]:
            for operation in operations:
                m = model()
                m.coins_micro = 10**18
                m.blueprints = 100
                d = m.districts["residential"]
                if operation in {"shops", "start_plan"}:
                    d.stage, d.shops, d.plan = 1, 1, None
                elif operation == "resume_plan":
                    m.pause_plan("residential")
                elif operation == "open_district":
                    d.stage, d.shops, d.plan = 2, 1, None
                elif operation == "railway":
                    d.stage, d.shops, d.crews, d.plan = 3, 1, 10, None
                    d.stock_micro = 500 * m.unit
                elif operation == "synergy":
                    d.stage, d.shops, d.plan = 2, 1, None
                    market = m.districts["market"]
                    market.open, market.stage, market.shops, market.crews = True, 2, 1, 1
                elif operation == "new_city":
                    for district in m.districts.values():
                        district.open, district.stage, district.shops, district.crews, district.plan = True, 3, 1, 1, None
                    m.city_arrived_micro = 100000 * m.unit
                callbacks = {
                    "packaging": lambda: m.purchase("packaging", 1),
                    "crews": lambda: m.purchase("crews", 1, "residential"),
                    "shops": lambda: m.purchase("shops", 1, "residential"),
                    "start_plan": lambda: m.start_plan("residential"),
                    "pause_plan": lambda: m.pause_plan("residential"),
                    "resume_plan": lambda: m.resume_plan("residential"),
                    "open_district": lambda: m.open_district("market"),
                    "railway": lambda: m.buy_railway("residential"),
                    "synergy": lambda: m.buy_synergy("joint_delivery"),
                    "research": lambda: m.buy_research("materials"),
                    "new_city": lambda: m.start_new_city(confirmed=True),
                }
                # The operation must be otherwise valid, so the failure isolates the session gate.
                m.begin_session(f"gate-{mode}-{operation}", mode=mode)
                before = m.snapshot()
                try:
                    callbacks[operation]()
                except EconomyError as error:
                    eq(str(error), "end the current session before investment or plan operations")
                else:
                    raise AssertionError(f"active {mode} accepted {operation}")
                eq(m.snapshot(), before)
                m.end_session()
                callbacks[operation]()
                verified.append({"mode": mode, "operation": operation,
                                 "active": "rejected", "after_session": "accepted"})
        return {"verified_entry_points": len(operations), "session_modes": 5,
                "cases": len(verified), "all_rejections_leave_state_unchanged": True,
                "details": verified}
    check("all_investment_and_plan_operations_reject_active_sessions", all_investment_entry_points_require_idle)

    def transport_upgrade_existing_queue():
        m = model()
        m.coins_micro = 40 * m.unit
        m.districts["residential"].queue_micro = 600 * m.unit
        q = m.quote_purchase("crews", 1, "residential")
        eq((q["before_wait_ms"], q["after_wait_ms"]), (150_000, 75_000))
        m.purchase("crews", 1, "residential")
        eq(m.districts["residential"].queue_micro, 600 * m.unit)
        m.advance(1000)
        eq(m.city_arrived_micro, 8 * m.unit)
        return q
    check("transport_purchase_accelerates_existing_queue_without_enlarging_it", transport_upgrade_existing_queue)

    def no_queue_wait():
        m = model()
        m.coins_micro = 100 * m.unit
        q = m.quote_purchase("crews", 1, "residential")
        return eq((q["before_wait_ms"], q["after_wait_ms"], q["wait_assumption"]),
                  (0, 0, "no_additional_arrivals"))
    check("empty_queue_displays_no_transport_wait", no_queue_wait)

    def stock_plan_no_second_reward():
        m = staged()
        m.coins_micro = 100 * m.unit
        d = m.districts["residential"]
        d.stock_micro = 150 * m.unit
        m.start_plan("residential")
        eq((d.stage, d.shops, d.stock_micro, m.coins_micro, m.city_arrived_micro), (2, 1, 0, 0, 0))
        return "existing stock completes stage2 immediately; plan transfer generates zero delivery coins"
    check("existing_stock_can_finish_plan_without_repaying_arrival", stock_plan_no_second_reward)

    def no_automatic_next_plan():
        m = model()
        m.districts["residential"].queue_micro = 500 * m.unit
        m.advance(125_000)
        d = m.districts["residential"]
        return eq((d.stage, d.plan, d.stock_micro), (1, None, 470 * m.unit))
    check("finished_plan_does_not_start_next_development_automatically", no_automatic_next_plan)

    def opening():
        m = model()
        m.coins_micro = 200 * m.unit
        m.persistent["stamps"] = list(range(100))
        reject(lambda: m.open_district("market"))
        d = m.districts["residential"]
        d.stage, d.shops, d.plan = 2, 1, None
        m.open_district("market")
        eq((m.districts["market"].open, m.districts["market"].crews, m.coins_micro), (True, 1, 50 * m.unit))
        return "100 stamps do not unlock market; current stage sum 2 plus 150 coins does"
    check("route_unlock_uses_current_stage_sum_not_achievements", opening)

    def research_cost_and_multiplier():
        m = model()
        m.blueprints = 15
        costs, factors = [], [str(m.research_multiplier("materials"))]
        for _ in range(5):
            receipt = m.buy_research("materials")
            costs.append(receipt["cost_blueprints"])
            factors.append(str(m.research_multiplier("materials")))
        eq(costs, [1, 2, 3, 4, 5])
        eq(factors, ["1", "5/4", "3/2", "7/4", "2", "9/4"])
        eq(m.blueprints, 0)
        reject(lambda: m.buy_research("materials"))
        return {"costs": costs, "multipliers": factors, "total_cost": 15}
    check("research_prices_1_to_5_and_additive_quarter_multipliers", research_cost_and_multiplier)

    def initial_research_choice():
        split = model()
        split.blueprints = 3
        for kind in split.research:
            split.buy_research(kind)
        eq(split.research, {"materials": 1, "logistics": 1, "commerce": 1})
        eq(split.transport_per_second_micro("residential"), 5 * split.unit)
        eq(split.new_city_preview()["first_building_base_materials"], {"numerator": 24, "denominator": 1})
        focus = model()
        focus.blueprints = 3
        focus.buy_research("materials")
        focus.buy_research("materials")
        eq(focus.new_city_preview()["first_building_base_materials"], {"numerator": 20, "denominator": 1})
        eq(focus.blueprints, 0)
        return {"split_first_building_base_materials": 24, "focused_rank2_first_building_base_materials": 20}
    check("first_three_blueprints_create_immediate_research_choices", initial_research_choice)

    def reward_thresholds():
        m = model()
        got = []
        for amount in (99999, 100000, 399999, 400000, 899999, 900000):
            m.city_arrived_micro = amount * m.unit
            got.append(m.new_city_preview()["reward_blueprints"])
        eq(got, [0, 3, 3, 6, 6, 9])
        m.city_arrived_micro = 100000 * m.unit
        p = m.new_city_preview()
        eq((p["next_reward_threshold_micro"], p["remaining_to_next_reward_micro"]),
           (str(400000 * m.unit), str(300000 * m.unit)))
        return {"rewards": got, "next_after_100000": 400000}
    check("new_city_reward_3_6_9_and_next_threshold", reward_thresholds)

    def city_reset():
        m = model()
        for d in m.districts.values():
            d.open, d.stage, d.shops, d.crews, d.plan = True, 3, 1, 10, None
        m.city_arrived_micro = 100000 * m.unit
        m.packaging_level = 10
        m.research["materials"] = 1
        m.blueprints = 2
        m.coins_micro = 1000 * m.unit
        m.persistent["vocabulary"] = ["known-word"]
        m.lifetime["completed_words"] = 100
        reject(lambda: m.start_new_city())
        reject(lambda: m.start_new_city(confirmed=True, location="PLAY"))
        m.begin_session("unfinished")
        reject(lambda: m.start_new_city(confirmed=True))
        m.end_session()
        old = m.city_id
        result = m.start_new_city(confirmed=True, location="RESULT", landscape="seaside")
        eq((m.coins_micro, m.packaging_level, m.city_arrived_micro, m.blueprints, m.research["materials"]),
           (0, 0, 0, 5, 1))
        eq((m.persistent["vocabulary"], m.lifetime["completed_words"]), (["known-word"], 100))
        eq(m.districts["residential"].plan.target_stage, 1)
        eq(sum(d.open for d in m.districts.values()), 1)
        eq(m.complete_word("unfinished", 1, 5, city_id=old)["reason"], "stale_city")
        return result
    check("new_city_reset_preserves_research_and_records_and_blocks_old_city_facts", city_reset)

    def insufficient_new_city():
        m = model()
        m.city_arrived_micro = 100000 * m.unit
        eq(m.new_city_preview()["eligible"], False)
        for d in m.districts.values():
            d.open, d.stage, d.shops, d.crews, d.plan = True, 3, 1, 1, None
        m.city_arrived_micro = 100000 * m.unit - 1
        eq(m.new_city_preview()["eligible"], False)
        m.city_arrived_micro += 1
        eq(m.new_city_preview()["eligible"], True)
        return "all six stage3 and the exact 100000-material threshold are both required"
    check("new_city_requires_all_stages_and_exact_arrival_threshold", insufficient_new_city)

    def fact_idempotence():
        m = fact_fixture()
        m.complete_word("facts", 1, 5, city_id=m.city_id)
        before = m.snapshot()
        eq(m.complete_word("facts", 1, 5, city_id=m.city_id)["reason"], "duplicate")
        eq(m.snapshot(), before)
        reject(lambda: m.complete_word("facts", 1, 6, city_id=m.city_id))
        m.ship_cargo("facts", 2, 50, 1, "manual", city_id=m.city_id)
        eq(m.districts["residential"].queue_micro, 6 * m.unit)
        restored = EconomyModel.from_snapshot(json.loads(json.dumps(m.snapshot())), config_path)
        eq(restored.ship_cargo("facts", 2, 50, 1, "manual", city_id=restored.city_id)["reason"], "duplicate")
        eq(restored.snapshot(), m.snapshot())
        return "word base and shipment bonus use separate sequences; each survives save/reload without reapplication"
    check("input_fact_identity_prevents_duplicates_including_after_save", fact_idempotence)

    def same_timestamp_order():
        m = model()
        m.districts["residential"].queue_micro = 30 * m.unit
        r = m.purchase("packaging", 1, at_ms=7500)
        eq((r["count"], m.coins_micro, m.districts["residential"].stage), (1, 10 * m.unit, 1))
        before = m.snapshot()
        m.advance_to(7500)
        eq(m.snapshot(), before)
        return "at ms7500 arrival grants 60, construction completes, then purchase spends 50"
    check("same_timestamp_arrival_then_construction_then_purchase", same_timestamp_order)

    def session_totals_separate():
        m = staged()
        m.districts["residential"].queue_micro = 100 * m.unit
        m.begin_session("summary")
        m.complete_word("summary", 1, 5, city_id=m.city_id, at_ms=1000)
        summary = m.end_session(at_ms=2000)
        eq((summary["generated_micro"], summary["arrived_during_session_micro"]), ("5000000", "8000000"))
        before = m.snapshot()
        eq(m.end_session(), summary)
        eq(m.snapshot(), before)
        return summary
    check("session_generation_and_arrivals_including_previous_queue_are_distinct", session_totals_separate)

    def synergy_effects():
        m = model()
        for d in m.districts.values():
            d.open, d.stage, d.shops, d.crews, d.plan = True, 3, 1, 1, None
        m.coins_micro = 113000 * m.unit
        income_before = m.total_income_per_second_micro()
        transport_before = m.transport_per_second_micro("harbor")
        for ident in m.synergy_config:
            m.buy_synergy(ident)
        eq((m.coins_micro, m.delivery_reward()), (0, 3))
        eq(m.transport_per_second_micro("harbor"), 2 * transport_before)
        eq(m.total_income_per_second_micro(), 2 * income_before)
        reject(lambda: m.buy_synergy("joint_delivery"))
        return {"delivery_reward": 3, "transport_factor": 2, "shop_income_factor": 2}
    check("all_synergy_prerequisites_prices_effects_and_single_ownership", synergy_effects)

    def synergy_future_only():
        m = staged(2)
        market = m.districts["market"]
        market.open, market.stage, market.shops, market.crews = True, 2, 1, 1
        m.districts["residential"].queue_micro = 8 * m.unit
        m.coins_micro = 1000 * m.unit
        m.advance(1000)
        previous_reward = m.lifetime["delivery_coins_micro"]
        m.buy_synergy("joint_delivery")
        m.advance(1000)
        eq((previous_reward, m.lifetime["delivery_coins_micro"]), (8 * m.unit, 20 * m.unit))
        return "first 4 materials pay 8; next 4 pay 12; past deliveries are unchanged"
    check("delivery_synergy_applies_only_to_future_arrivals", synergy_future_only)

    def store_milestones():
        m = staged(5, 50)
        eq(m.shop_income_per_second_micro("residential"), 640 * m.unit)
        d = m.districts["residential"]
        d.crews = 50
        eq(m.transport_per_second_micro("residential"), 1600 * m.unit)
        return {"stage5_50_shops_coins_per_second": 640, "50_crews_material_per_second": 1600}
    check("store_and_transport_milestone_formulas", store_milestones)

    def serialization_micro_strings():
        m = fact_fixture(1, 1)
        m.complete_word("facts", 1, 3, city_id=m.city_id)
        m.advance(1)
        saved = json.loads(json.dumps(m.snapshot()))
        checked = []
        def walk(value):
            if isinstance(value, dict):
                for key, item in value.items():
                    if key.endswith("_micro"):
                        if not isinstance(item, str) or not item.isdecimal():
                            raise AssertionError(f"invalid micro field {key}")
                        checked.append(key)
                    else:
                        walk(item)
            elif isinstance(value, list):
                for item in value:
                    walk(item)
        walk(saved)
        eq(EconomyModel.from_snapshot(saved, config_path).snapshot(), saved)
        saved["coins_micro"] = 0.0
        reject(lambda: EconomyModel.from_snapshot(saved, config_path))
        return {"micro_fields_checked": len(checked), "float_resource_save": "rejected"}
    check("saved_resources_are_decimal_strings_and_roundtrip_exactly", serialization_micro_strings)

    def all_development_totals():
        b = balance_analysis(config_path)
        eq(b["totals"]["stage_1_to_5_materials_micro"], "767340000000")
        eq(b["totals"]["stage_1_to_5_coins_micro"], "1178100000000")
        eq(b["totals"]["railway_materials_micro"], "31500000000")
        eq(b["totals"]["railway_coins_micro"], "189000000000")
        eq(b["totals"]["unlock_coins_micro"], "51150000000")
        eq(b["totals"]["development_plus_railway_materials_micro"], "798840000000")
        return b["totals"]
    check("six_district_stage5_and_railway_cost_totals", all_development_totals)

    def profile_expected_values():
        b = balance_analysis(config_path)
        actual = [(p["completed_words_needed_to_generate_30"], p["sessions_needed_to_generate_30"],
                   p["first_building_completed_at_ms"], p["first_session"]["generated_micro"])
                  for p in b["profiles"]]
        eq(actual, [(6, 2, 180000, "16000000"), (6, 1, 46250, "64000000"),
                    (5, 1, 12500, "450000000")])
        return {"profiles": actual, "interpretation": "model values under stated assumptions; no playtest claim"}
    check("three_declared_input_profiles_have_reproducible_first_building_values", profile_expected_values)

    def error_discards_cargo_not_generated_material():
        p = simulate_input_profile("standard-cargo-loss", 7500,
                                   [True, True, True, True, False], 1, config_path)
        losses = [loss for loss in p["cargo_losses"] if loss["session"] == 1]
        shipments = [fact for fact in p["shipment_facts"] if fact["session"] == 1]
        eq([(loss["word"], loss["discarded_count"], loss["discarded_score"]) for loss in losses],
           [(5, 4, 200), (10, 4, 200)])
        eq([(s["reason"], s["score_sum"], s["cargo_count"], s["bonus_points"],
             s["generated_micro"]) for s in shipments], [("deadline", 100, 2, 40, "4000000")])
        summary = p["first_session"]
        eq((summary["generated_micro"], summary["arrived_during_session_micro"],
            summary["remaining_queue_micro"], summary["delivery_coins_micro"],
            summary["shop_coins_micro"], p["first_session_end_queue_clear_ms_no_more_input"]),
           ("64000000", "59000000", "5000000", "118000000", "4375000", 1250))
        return {"discarded_cargo": losses, "surviving_deadline_shipment": shipments,
                "base_material_preserved": "60", "bonus_material": "4",
                "generated_material": "64", "arrived_material": "59", "queued_material": "5"}
    check("profile_mistakes_discard_held_cargo_but_keep_completed_word_material", error_discards_cargo_not_generated_material)

    def all_profile_words_precede_deadline():
        b = balance_analysis(config_path)
        counts = {}
        for p in b["profiles"]:
            times = p["assumptions"]["completion_times_ms"]
            eq(all(0 <= t < 90_000 for t in times), True)
            eq(times[-1], 89_000)
            eq(len(times), p["assumptions"]["completed_words_per_session"])
            counts[p["name"]] = len(times)
        return {"completion_counts": counts, "all_word_event_offsets_lt_ms": 90000,
                "last_word_event_ms": 89000, "deadline_shipment_at_ms": 90000}
    check("all_profile_word_events_precede_the_90second_input_deadline", all_profile_words_precede_deadline)

    def no_offline_typing_progress():
        m = staged()
        m.lifetime["completed_words"] = 7
        m.persistent["vocabulary"] = ["existing"]
        m.restore_at(28_800_000)
        eq((m.lifetime["completed_words"], m.lifetime["generated_micro"], m.persistent["vocabulary"]),
           (7, 0, ["existing"]))
        return "offline progression changes transport and shop income only"
    check("offline_progress_does_not_invent_words_or_vocabulary", no_offline_typing_progress)

    def paused_offline_plan():
        m = model()
        d = m.districts["residential"]
        d.plan.reserved_micro = 10 * m.unit
        d.queue_micro = 100 * m.unit
        m.pause_plan("residential")
        m.restore_at(28_800_000)
        eq((d.stage, d.plan.reserved_micro, d.stock_micro, d.queue_micro),
           (0, 10 * m.unit, 100 * m.unit, 0))
        return "8 h leaves paused stage0 unchanged; 10 reserved plus 100 stock remain separate"
    check("offline_arrivals_do_not_complete_paused_plan", paused_offline_plan)

    def new_city_landscape_equivalence():
        states = []
        for landscape in ("riverside", "seaside", "highland"):
            m = model()
            for d in m.districts.values():
                d.open, d.stage, d.shops, d.crews, d.plan = True, 3, 1, 1, None
            m.city_arrived_micro = 100000 * m.unit
            m.start_new_city(confirmed=True, landscape=landscape)
            state = m.snapshot()
            state.pop("landscape")
            states.append(state)
        eq(states[0], states[1])
        eq(states[1], states[2])
        return "all three landscapes have identical economic state"
    check("landscape_choice_has_no_economic_effect", new_city_landscape_equivalence)

    failed = sum(not result["passed"] for result in results)
    return {"schema_version": "1.0.0", "economy_version": model().config["economy_version"],
            "model_role": "deterministic numerical reference; author validation, not independent review",
            "source_config_sha256": hashlib.sha256(Path(config_path or DEFAULT_CONFIG).read_bytes()).hexdigest(),
            "checks": len(results), "passed": len(results) - failed, "failed": failed,
            "results": results, "balance": balance_analysis(config_path)}


if __name__ == "__main__":
    raise SystemExit(main())
