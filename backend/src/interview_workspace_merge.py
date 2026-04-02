"""Merge interview workspace JSON so interviewers cannot overwrite others' feedback."""
from __future__ import annotations

import copy
import json
from typing import Any, Dict, List, Optional


def _norm_name(s: str) -> str:
    return " ".join((s or "").strip().lower().split())


def _row_owned_by(int_row: Dict[str, Any], user_id: str, user_name: str) -> bool:
    oid = int_row.get("ownerUserId")
    if oid is not None and str(oid) == str(user_id):
        return True
    if oid is None or oid == "":
        inm = str(int_row.get("interviewerName") or "")
        if user_name and _norm_name(inm) == _norm_name(user_name):
            return True
    return False


def _round_owned_by(round_row: Dict[str, Any], user_id: str) -> bool:
    oid = round_row.get("ownerUserId")
    return oid is not None and str(oid) == str(user_id)


def merge_interview_workspace_for_interviewer(
    existing_json: Optional[str],
    incoming: Dict[str, Any],
    user_id: str,
    user_name: str,
) -> Dict[str, Any]:
    """Keep others' rows and the stored final recommendation; apply this user's row edits and removals."""

    def loads_ws(j: Optional[str]) -> Dict[str, Any]:
        if not j:
            return {"rounds": [], "finalRecommendation": ""}
        try:
            d = json.loads(j)
        except json.JSONDecodeError:
            return {"rounds": [], "finalRecommendation": ""}
        if not isinstance(d, dict):
            return {"rounds": [], "finalRecommendation": ""}
        rounds = d.get("rounds")
        if not isinstance(rounds, list):
            rounds = []
        fr = d.get("finalRecommendation")
        return {
            "rounds": copy.deepcopy(rounds),
            "finalRecommendation": str(fr if fr is not None else ""),
        }

    base = loads_ws(existing_json)
    inc = incoming if isinstance(incoming, dict) else {}
    inc_rounds = inc.get("rounds")
    if not isinstance(inc_rounds, list):
        inc_rounds = []

    out_rounds: List[Dict[str, Any]] = copy.deepcopy(base["rounds"])
    index_by_id: Dict[str, int] = {}
    for idx, r in enumerate(out_rounds):
        if isinstance(r, dict) and r.get("id"):
            index_by_id[str(r["id"])] = idx

    uid = str(user_id)

    for r_in in inc_rounds:
        if not isinstance(r_in, dict) or not r_in.get("id"):
            continue
        rid = str(r_in["id"])

        if rid not in index_by_id:
            ro = str(r_in.get("ownerUserId") or "")
            intr_all = [
                i
                for i in (r_in.get("interviewers") or [])
                if isinstance(i, dict) and i.get("id")
            ]
            # Accept new rounds created by this user, or legacy/seed rounds with no owner if
            # every interviewer row is theirs (or the round is still empty).
            round_owned = ro == uid
            unowned_only_own_interviewers = ro == "" and all(
                _row_owned_by(i, uid, user_name) for i in intr_all
            )
            if not (round_owned or unowned_only_own_interviewers):
                continue
            cleaned = copy.deepcopy(r_in)
            intr: List[Dict[str, Any]] = []
            for i in r_in.get("interviewers") or []:
                if isinstance(i, dict) and _row_owned_by(i, uid, user_name):
                    intr.append(copy.deepcopy(i))
            cleaned["interviewers"] = intr
            out_rounds.append(cleaned)
            index_by_id[rid] = len(out_rounds) - 1
            continue

        idx = index_by_id[rid]
        r_out = out_rounds[idx]
        if not isinstance(r_out, dict):
            continue

        if "isExpanded" in r_in:
            r_out["isExpanded"] = r_in["isExpanded"]

        if _round_owned_by(r_out, uid) or str(r_in.get("ownerUserId") or "") == uid:
            if "roundTitle" in r_in:
                r_out["roundTitle"] = r_in["roundTitle"]
        if _round_owned_by(r_in, uid) and r_out.get("ownerUserId") in (None, ""):
            r_out["ownerUserId"] = r_in.get("ownerUserId")

        incoming_list = [
            i
            for i in (r_in.get("interviewers") or [])
            if isinstance(i, dict) and i.get("id")
        ]
        incoming_by_id = {str(i["id"]): i for i in incoming_list}

        base_list = [
            copy.deepcopy(i)
            for i in (r_out.get("interviewers") or [])
            if isinstance(i, dict) and i.get("id")
        ]
        base_ids = {str(i["id"]) for i in base_list}

        merged_interviewers: List[Dict[str, Any]] = []
        for prev in base_list:
            iid = str(prev["id"])
            owned = _row_owned_by(prev, uid, user_name)
            if not owned:
                merged_interviewers.append(prev)
                continue
            if iid not in incoming_by_id:
                # Owner removed their own row from the payload.
                continue
            i_in = incoming_by_id[iid]
            prev["strengths"] = i_in.get("strengths", prev.get("strengths"))
            prev["concerns"] = i_in.get("concerns", prev.get("concerns"))
            prev["recommendation"] = i_in.get("recommendation", prev.get("recommendation"))
            if i_in.get("ownerUserId"):
                prev["ownerUserId"] = i_in.get("ownerUserId")
            if i_in.get("interviewerName"):
                prev["interviewerName"] = i_in.get("interviewerName")
            merged_interviewers.append(prev)

        for i_in in incoming_list:
            iid = str(i_in["id"])
            if iid in base_ids:
                continue
            if _row_owned_by(i_in, uid, user_name):
                merged_interviewers.append(copy.deepcopy(i_in))

        r_out["interviewers"] = merged_interviewers
        out_rounds[idx] = r_out

    return {
        "rounds": out_rounds,
        "finalRecommendation": base["finalRecommendation"],
    }
