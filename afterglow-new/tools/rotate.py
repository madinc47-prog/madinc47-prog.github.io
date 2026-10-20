#!/usr/bin/env python3
"""Build now-showing.json: Afterglow's rotation schedule.

Modern titles (recent, action-2026, action-80s, plus Local Films whose makers
ticked the rotation box) come and go on a staggered schedule, like a TV channel:
ON_DAYS on air, then OFF_DAYS off, offsets spread so something arrives or leaves
most days. Vintage Vault and other Local Films stay on all the time.

Run weekly (or any time) to extend the schedule:  python3 tools/rotate.py
"""
import json, os, hashlib, datetime as dt
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ON_DAYS, OFF_DAYS = 21, 14
CYCLE = ON_DAYS + OFF_DAYS
START = dt.date(2026, 10, 1)
WEEKS_AHEAD = 20
ROTATING = {"recent", "action-2026", "action-80s"}

cat = json.load(open(os.path.join(ROOT, "new-recent.json")))
ids = [x["id"] for x in cat["items"] if x.get("shelf", "recent") in ROTATING]
try:
    com = json.load(open(os.path.join(ROOT, "community", "community.json")))
    ids += ["local:" + x["id"] for x in com.get("items", []) if x.get("rotation") is True]
except FileNotFoundError:
    pass
ids.sort(key=lambda i: hashlib.sha1(i.encode()).hexdigest())  # stable shuffle
today = dt.date.today()
end = today + dt.timedelta(weeks=WEEKS_AHEAD)
windows = []
for n, i in enumerate(ids):
    off = round(n * CYCLE / max(len(ids), 1))
    d = START - dt.timedelta(days=CYCLE) + dt.timedelta(days=off)
    while d <= end:
        last = d + dt.timedelta(days=ON_DAYS - 1)
        if last >= today - dt.timedelta(days=CYCLE):
            windows.append({"id": i, "from": d.isoformat(), "until": last.isoformat()})
        d += dt.timedelta(days=CYCLE)
out = {
    "about": "Afterglow rotation. Titles come and go on this schedule. Dates are inclusive, local time. "
             "This is programming, not copy protection: the films stay on their owners' channels.",
    "generated": today.isoformat(), "onDays": ON_DAYS, "offDays": OFF_DAYS, "watchWindowHours": 48,
    "windows": sorted(windows, key=lambda w: (w["from"], w["id"])),
}
json.dump(out, open(os.path.join(ROOT, "now-showing.json"), "w"), indent=1)
on = sum(1 for w in windows if w["from"] <= today.isoformat() <= w["until"])
print("%d rotating titles, %d windows, %d on air today (%s)" % (len(ids), len(windows), on, today))
