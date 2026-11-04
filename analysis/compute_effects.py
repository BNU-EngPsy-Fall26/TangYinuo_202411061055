#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
compute_effects.py —— 把收数后台导出的数据整理成网页可读的 js/data.js

用法
----
    # ① 从 attention-lab /hw2 后台下载 JSON 或 CSV，然后：
    python analysis/compute_effects.py --in hw2_export.json
    python analysis/compute_effects.py --in hw2_export.csv --out js/data.js --summary

    # ② 如果被试是手动发 CSV 给你的（上传失败的情况），把多个文件放在一个目录：
    python analysis/compute_effects.py --in ./被试数据/

支持的输入
----------
1) JSON：提交数组 [{"participant":..., "experiment":..., "trials":[...]}, ...]
   或包一层 {"data": [...]} / {"rows": [...]} / {"submissions": [...]}
2) CSV：逐试次长表（每行一个试次，含 participant / experiment / cond / rt / correct ...）
   或逐提交表（含一个 trials 列，内容是 JSON 字符串）

输出
----
    js/data.js  —— window.ALAB_DATA = {...}，结果页读它
    终端打印一份描述统计，可直接贴进 README 的「结果」一节
"""

import argparse
import csv
import json
import math
import os
import sys
from collections import defaultdict
from datetime import datetime

# --------------------------------------------------------------------------
# 一、读入各种格式
# --------------------------------------------------------------------------

TRIAL_KEYS = {"cond", "rt", "correct", "present", "resp", "estimate", "errSigned",
              "absErr", "truePct", "timeout", "format", "ticks"}


def _coerce_trial(d):
    """把一行字典整理成干净的试次记录"""
    out = {}
    for k, v in d.items():
        if k is None:
            continue
        key = str(k).strip()
        if key in ("participant", "experiment", "condition", "submittedAt",
                   "submitted_at", "project", "expTitle", "durationSec",
                   "trial_index", "index", "id", "_id"):
            continue
        if v is None or v == "":
            out[key] = None
            continue
        if key in ("correct",):
            out[key] = str(v).strip().lower() in ("1", "true", "yes", "y", "是", "正确")
        elif key in ("rt", "present", "timeout", "ticks", "estimate", "errSigned",
                     "absErr", "truePct"):
            try:
                out[key] = float(v) if "." in str(v) else int(float(v))
            except (TypeError, ValueError):
                out[key] = None
        else:
            out[key] = v
    return out


def _norm_submission(obj, default_exp=None):
    """把一个提交对象规范成 {participant, experiment, condition, trials}"""
    if not isinstance(obj, dict):
        return None

    trials = obj.get("trials") or obj.get("data") or []
    if isinstance(trials, str):
        try:
            trials = json.loads(trials)
        except json.JSONDecodeError:
            trials = []
    if not isinstance(trials, list):
        return None

    pid = obj.get("participant") or obj.get("participant_id") or obj.get("pid") or obj.get("subject")
    exp = obj.get("experiment") or obj.get("exp") or default_exp
    if not pid or not exp:
        return None

    clean = []
    for t in trials:
        if isinstance(t, dict):
            rec = _coerce_trial(t)
            if rec.get("cond") is not None:
                clean.append(rec)

    return {
        "participant": str(pid).strip(),
        "experiment": str(exp).strip(),
        "condition": str(obj.get("condition") or "within"),
        "submittedAt": obj.get("submittedAt") or obj.get("submitted_at") or "",
        "trials": clean,
    }


def load_json(path):
    with open(path, "r", encoding="utf-8-sig") as f:
        raw = json.load(f)

    if isinstance(raw, dict):
        for key in ("submissions", "data", "rows", "results", "records", "items"):
            if isinstance(raw.get(key), list):
                raw = raw[key]
                break

    if not isinstance(raw, list):
        return []

    return [s for s in (_norm_submission(o) for o in raw) if s and s["trials"]]


def load_csv(path):
    with open(path, "r", encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
    if not rows:
        return []

    headers = [h.strip() for h in rows[0].keys()]

    # 情况 A：逐提交表，有一列装着 trials 的 JSON
    json_col = None
    for h in headers:
        if h.lower() in ("trials", "data", "trial_data"):
            sample = str(rows[0].get(h) or "")
            if sample.strip().startswith("["):
                json_col = h
                break

    if json_col:
        subs = []
        for r in rows:
            obj = {
                "participant": r.get("participant") or r.get("participant_id") or r.get("pid"),
                "experiment": r.get("experiment") or r.get("exp"),
                "condition": r.get("condition"),
                "submittedAt": r.get("submittedAt") or r.get("submitted_at"),
                "trials": r.get(json_col),
            }
            s = _norm_submission(obj)
            if s:
                subs.append(s)
        return subs

    # 情况 B：逐试次长表
    grouped = defaultdict(list)
    meta = {}
    for r in rows:
        pid = r.get("participant") or r.get("participant_id") or r.get("pid")
        exp = r.get("experiment") or r.get("exp")
        if not pid or not exp:
            continue
        key = (str(pid).strip(), str(exp).strip())
        rec = _coerce_trial(r)
        if rec.get("cond") is None:
            continue
        grouped[key].append(rec)
        if key not in meta:
            meta[key] = {
                "condition": r.get("condition") or "within",
                "submittedAt": r.get("submittedAt") or r.get("submitted_at") or "",
            }

    out = []
    for (pid, exp), trials in grouped.items():
        out.append({
            "participant": pid,
            "experiment": exp,
            "condition": meta[(pid, exp)]["condition"],
            "submittedAt": meta[(pid, exp)]["submittedAt"],
            "trials": trials,
        })
    return out


def load_any(path):
    if os.path.isdir(path):
        subs = []
        for name in sorted(os.listdir(path)):
            full = os.path.join(path, name)
            if os.path.isfile(full) and name.lower().endswith((".json", ".csv")):
                subs.extend(load_any(full))
        return subs

    ext = os.path.splitext(path)[1].lower()
    if ext == ".json":
        return load_json(path)
    if ext == ".csv":
        return load_csv(path)
    print(f"跳过不支持的文件：{path}", file=sys.stderr)
    return []


# --------------------------------------------------------------------------
# 二、统计（纯 Python，不依赖 numpy/scipy）
# --------------------------------------------------------------------------

def mean(xs):
    xs = [x for x in xs if x is not None and not (isinstance(x, float) and math.isnan(x))]
    return sum(xs) / len(xs) if xs else float("nan")


def sd(xs):
    xs = [x for x in xs if x is not None and not (isinstance(x, float) and math.isnan(x))]
    if len(xs) < 2:
        return float("nan")
    m = mean(xs)
    return math.sqrt(sum((x - m) ** 2 for x in xs) / (len(xs) - 1))


def _betacf(a, b, x):
    MAXIT, EPS, FPMIN = 200, 3e-12, 1e-30
    qab, qap, qam = a + b, a + 1.0, a - 1.0
    c = 1.0
    d = 1.0 - qab * x / qap
    if abs(d) < FPMIN:
        d = FPMIN
    d = 1.0 / d
    h = d
    for m in range(1, MAXIT + 1):
        m2 = 2 * m
        aa = m * (b - m) * x / ((qam + m2) * (a + m2))
        d = 1.0 + aa * d
        if abs(d) < FPMIN:
            d = FPMIN
        c = 1.0 + aa / c
        if abs(c) < FPMIN:
            c = FPMIN
        d = 1.0 / d
        h *= d * c
        aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))
        d = 1.0 + aa * d
        if abs(d) < FPMIN:
            d = FPMIN
        c = 1.0 + aa / c
        if abs(c) < FPMIN:
            c = FPMIN
        d = 1.0 / d
        de = d * c
        h *= de
        if abs(de - 1.0) < EPS:
            break
    return h


def _betai(a, b, x):
    if x <= 0:
        return 0.0
    if x >= 1:
        return 1.0
    lbeta = math.lgamma(a + b) - math.lgamma(a) - math.lgamma(b)
    bt = math.exp(lbeta + a * math.log(x) + b * math.log(1.0 - x))
    if x < (a + 1.0) / (a + b + 2.0):
        return bt * _betacf(a, b, x) / a
    return 1.0 - bt * _betacf(b, a, 1.0 - x) / b


def t_pvalue(t, df):
    if df <= 0 or not math.isfinite(t):
        return float("nan")
    x = df / (df + t * t)
    p = 0.5 * _betai(df / 2.0, 0.5, x)
    return min(1.0, 2 * p)


def paired_t(xs, ys):
    """返回 (diff均值, t, df, p, dz)；ys - xs"""
    pairs = [(a, b) for a, b in zip(xs, ys)
             if a is not None and b is not None
             and math.isfinite(a) and math.isfinite(b)]
    n = len(pairs)
    if n < 2:
        return None
    diff = [b - a for a, b in pairs]
    m, s = mean(diff), sd(diff)
    if not s:
        return None
    se = s / math.sqrt(n)
    t = m / se
    return {"meanDiff": m, "t": t, "df": n - 1, "p": t_pvalue(t, n - 1),
            "dz": m / s, "n": n}


def norm_inv(p):
    """标准正态分位数（Acklam 近似）"""
    p = min(max(p, 1e-9), 1 - 1e-9)
    a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
         1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00]
    b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
         6.680131188771972e+01, -1.328068155288572e+01]
    c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
         -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00]
    d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00,
         3.754408661907416e+00]
    pl = 0.02425
    if p < pl:
        q = math.sqrt(-2 * math.log(p))
        return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / \
               ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    if p > 1 - pl:
        q = math.sqrt(-2 * math.log(1 - p))
        return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / \
                ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    q = p - 0.5
    r = q * q
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / \
           (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)


# --------------------------------------------------------------------------
# 三、按实验汇总
# --------------------------------------------------------------------------

def dedupe(subs):
    """同一被试同一实验只保留最后一次提交"""
    best = {}
    for s in subs:
        key = (s["participant"], s["experiment"])
        if key not in best or str(s.get("submittedAt", "")) >= str(best[key].get("submittedAt", "")):
            best[key] = s
    return list(best.values())


def summarize_cb(subs):
    rows = []
    for s in subs:
        d = {}
        for c in ("inset", "outset"):
            ts = [t for t in s["trials"] if t.get("cond") == c]
            ok = [t for t in ts if t.get("correct") and t.get("rt") is not None]
            d[c + "_rt"] = mean([t["rt"] for t in ok]) if ok else None
            d[c + "_acc"] = (len([t for t in ts if t.get("correct")]) / len(ts)) if ts else None
        rows.append(d)
    ins = [r["inset_rt"] for r in rows if r["inset_rt"] is not None]
    out = [r["outset_rt"] for r in rows if r["outset_rt"] is not None]
    test = paired_t(ins, out)
    print(f"  闪烁变化盲：n={len(ins)}　目标色 RT={mean(ins):.0f}±{sd(ins):.0f} ms　"
          f"非目标色 RT={mean(out):.0f}±{sd(out):.0f} ms")
    if test:
        print(f"    非目标色−目标色 = {test['meanDiff']:.0f} ms, t({test['df']})={test['t']:.2f}, "
              f"p={test['p']:.4f}, dz={test['dz']:.2f}")
    accs_in = [r["inset_acc"] for r in rows if r["inset_acc"] is not None]
    accs_out = [r["outset_acc"] for r in rows if r["outset_acc"] is not None]
    print(f"    正确率：目标色 {mean(accs_in)*100:.1f}%　非目标色 {mean(accs_out)*100:.1f}%")


def summarize_lp(subs):
    conds = ["high", "low", "lowfb"]
    table = {c: {"miss": [], "c": [], "d": []} for c in conds}
    for s in subs:
        for c in conds:
            ts = [t for t in s["trials"] if t.get("cond") == c]
            pres = [t for t in ts if t.get("present") == 1]
            absn = [t for t in ts if t.get("present") == 0]
            if not pres or not absn:
                continue
            hit = len([t for t in pres if t.get("resp") == "yes"])
            fa = len([t for t in absn if t.get("resp") == "yes"])
            h = (hit + 0.5) / (len(pres) + 1)
            f = (fa + 0.5) / (len(absn) + 1)
            table[c]["miss"].append(1 - hit / len(pres))
            table[c]["d"].append(norm_inv(h) - norm_inv(f))
            table[c]["c"].append(-0.5 * (norm_inv(h) + norm_inv(f)))

    print(f"  低流行率搜索：n={len(table['low']['miss'])}")
    for c in conds:
        if table[c]["miss"]:
            print(f"    {c:6s} 漏报率={mean(table[c]['miss'])*100:5.1f}%  "
                  f"d'={mean(table[c]['d']):.2f}  c={mean(table[c]['c']):.2f}")
    for label, a, b in (("low−high 漏报", "high", "low"), ("lowfb−low 漏报", "low", "lowfb")):
        t = paired_t(table[a]["miss"], table[b]["miss"])
        if t:
            print(f"    {label}: Δ={t['meanDiff']*100:+.1f} pp, t({t['df']})={t['t']:.2f}, "
                  f"p={t['p']:.4f}, dz={t['dz']:.2f}")
    t = paired_t(table["low"]["c"], table["lowfb"]["c"])
    if t:
        print(f"    c(lowfb)−c(low): Δ={t['meanDiff']:+.2f}, t({t['df']})={t['t']:.2f}, "
              f"p={t['p']:.4f}, dz={t['dz']:.2f}")


def summarize_cm(subs):
    cells = ["bar_noticks", "bar_ticks", "pie_noticks", "pie_ticks"]
    vals = {c: [] for c in cells}
    for s in subs:
        for c in cells:
            ts = [t for t in s["trials"] if t.get("cond") == c]
            if ts:
                vals[c].append(mean([abs(t.get("errSigned", 0)) for t in ts]))

    print(f"  比例判断：n={len(vals['bar_noticks'])}")
    for c in cells:
        if vals[c]:
            print(f"    {c:12s} 平均绝对误差={mean(vals[c]):5.1f} ± {sd(vals[c]):4.1f} pp")

    t = paired_t(vals["bar_noticks"], vals["pie_noticks"])
    if t:
        print(f"    饼−条（无刻度）: Δ={t['meanDiff']:+.1f} pp, t({t['df']})={t['t']:.2f}, "
              f"p={t['p']:.4f}, dz={t['dz']:.2f}")

    no_t = [mean([a, b]) for a, b in zip(vals["bar_noticks"], vals["pie_noticks"])]
    wi_t = [mean([a, b]) for a, b in zip(vals["bar_ticks"], vals["pie_ticks"])]
    t2 = paired_t(no_t, wi_t)
    if t2:
        print(f"    有刻度−无刻度: Δ={t2['meanDiff']:+.1f} pp, t({t2['df']})={t2['t']:.2f}, "
              f"p={t2['p']:.4f}, dz={t2['dz']:.2f}")


# --------------------------------------------------------------------------
# 四、主流程
# --------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(description="把收数导出整理成 js/data.js")
    ap.add_argument("--in", dest="inp", required=True, help="导出的 .json / .csv / 目录")
    ap.add_argument("--out", dest="out", default=os.path.join("js", "data.js"),
                    help="输出路径，默认 js/data.js")
    ap.add_argument("--summary", action="store_true", help="在终端打印描述统计")
    ap.add_argument("--exclude", default="",
                    help="剔除测试数据：编号或「编号:实验」，逗号分隔，如 P-4K7Q2M,P-9XZ1AB:cb")
    ap.add_argument("--min-trials", type=int, default=0,
                    help="剔除试次数少于此值的提交（用于过滤中途退出的被试）")
    args = ap.parse_args()

    subs = dedupe(load_any(args.inp))
    if not subs:
        print("没有解析到任何有效提交。请检查导出格式（参见脚本头部说明）。", file=sys.stderr)
        return 1

    # 剔除自测/中途退出的数据
    if args.exclude:
        drops = {x.strip().upper() for x in args.exclude.split(",") if x.strip()}
        kept = []
        for s in subs:
            pid = str(s["participant"]).upper()
            exp = str(s["experiment"]).upper()
            if pid in drops or f"{pid}:{exp}" in drops:
                print(f"  已剔除：{s['participant']} / {s['experiment']}（手动指定）")
                continue
            kept.append(s)
        subs = kept

    if args.min_trials:
        kept = [s for s in subs if len(s["trials"]) >= args.min_trials]
        dropped = len(subs) - len(kept)
        if dropped:
            print(f"  已剔除 {dropped} 条试次不足 {args.min_trials} 的提交（可能中途退出）")
        subs = kept

    if not subs:
        print("剔除后没有剩余数据。", file=sys.stderr)
        return 1

    by_exp = defaultdict(list)
    for s in subs:
        by_exp[s["experiment"]].append(s)

    print(f"共 {len(subs)} 条提交，被试 {len({s['participant'] for s in subs})} 人。")
    for exp, lst in sorted(by_exp.items()):
        print(f"  {exp}: {len(lst)} 人，"
              f"人均试次 {mean([len(s['trials']) for s in lst]):.0f}")

    payload = {
        "collectedAt": datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
        "source": os.path.basename(os.path.abspath(args.inp)),
        "submissions": subs,
    }

    out_path = args.out
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write("/* 由 analysis/compute_effects.py 自动生成，请勿手改 */\n")
        f.write("window.ALAB_DATA = ")
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")

    print(f"已写入 {out_path}（{os.path.getsize(out_path)/1024:.0f} KB）")

    if args.summary:
        print("\n描述统计：")
        if "cb" in by_exp:
            summarize_cb(by_exp["cb"])
        if "lp" in by_exp:
            summarize_lp(by_exp["lp"])
        if "cm" in by_exp:
            summarize_cm(by_exp["cm"])

    return 0


if __name__ == "__main__":
    sys.exit(main())
