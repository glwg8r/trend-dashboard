import os, json, re, collections, datetime, sys
from urllib.parse import quote
import requests

LOG_PREFIX = "[trends]"
def log(*args): print(LOG_PREFIX, *args); sys.stdout.flush()

# Optional Google Trends via pytrends (no key). We’ll handle absence gracefully.
try:
    from pytrends.request import TrendReq
    HAS_PYTRENDS = True
except Exception:
    HAS_PYTRENDS = False
    log("pytrends not available; Google Trends will be skipped.")

YT_API_KEY = os.getenv("YT_API_KEY")  # optional

STOPWORDS = set("""
a an the and or of to in for on with by from at as is are was were be been being this that these those
i you he she it we they them us our your their not but if then than so such about into over under out up down
how what when where which who whom why will would can could should may might just more most many much
""".split())

def tokenize(text: str):
    text = text.lower()
    text = re.sub(r"http\\S+|www\\.\\S+", "", text)
    text = re.sub(r"[^a-z0-9\\s\\-#_+]", " ", text)
    toks = [t.strip("-_+") for t in text.split()]
    return [t for t in toks if t and t not in STOPWORDS and not t.isdigit() and len(t) > 2]

def bigrams(tokens):
    return [" ".join(pair) for pair in zip(tokens, tokens[1:])]

def fetch_google_trends():
    items = []
    if not HAS_PYTRENDS:
        return items
    try:
        pytrend = TrendReq(hl="en-US", tz=0)
        df = pytrend.trending_searches(pn="united_states")
        rows = df[0].tolist() if not df.empty else []
        for row in rows:
            items.append({
                "title": row,
                "url": f"https://trends.google.com/trends/explore?q={quote(row)}"
            })
        log("GoogleTrends:", len(items), "items")
    except Exception as e:
        log("GoogleTrends error:", repr(e))
    return items

def fetch_wikipedia_top():
    """Top most-read English Wikipedia pages for yesterday (UTC)."""
    items = []
    try:
        yday = (datetime.datetime.utcnow() - datetime.timedelta(days=1))
        y, m, d = yday.strftime("%Y"), yday.strftime("%m"), yday.strftime("%d")
        url = f"https://wikimedia.org/api/rest_v1/metrics/pageviews/top/en.wikipedia/all-access/{y}/{m}/{d}"
        r = requests.get(url, timeout=20, headers={"User-Agent":"GNN-Trends/1.0"})
        data = r.json()
        articles = data.get("items", [])[0].get("articles", [])
        for a in articles[:100]:
            title = a.get("article", "").replace("_", " ")
            if title and title.lower() != "main page":
                items.append({
                    "title": title,
                    "url": f"https://en.wikipedia.org/wiki/{quote(a.get('article',''))}"
                })
        log("Wikipedia:", len(items), "items")
    except Exception as e:
        log("Wikipedia error:", repr(e))
    return items

def fetch_reddit(subs=("news","worldnews","politics")):
    headers = {"User-Agent": "GNN-Trends/1.0 (+github actions)"}
    items = []
    for sub in subs:
        try:
            r = requests.get(f"https://www.reddit.com/r/{sub}/hot.json?limit=50",
                             headers=headers, timeout=20)
            data = r.json()
            for p in data.get("data", {}).get("children", []):
                d = p.get("data", {})
                title = d.get("title") or ""
                url = "https://www.reddit.com" + (d.get("permalink") or "")
                if title:
                    items.append({"title": title, "url": url})
        except Exception as e:
            log(f"Reddit /r/{sub} error:", repr(e))
            continue
    log("Reddit:", len(items), "items")
    return items

def fetch_youtube_trending(region="US"):
    if not YT_API_KEY:
        log("YouTube: no API key; skipping.")
        return []
    try:
        url = ("https://www.googleapis.com/youtube/v3/videos"
               f"?part=snippet,statistics&chart=mostPopular&regionCode={region}&maxResults=50&key={YT_API_KEY}")
        r = requests.get(url, timeout=25)
        data = r.json()
        items = []
        for v in data.get("items", []):
            sn = v.get("snippet", {})
            title = sn.get("title") or ""
            vid = v.get("id")
            if title and vid:
                items.append({"title": title, "url": f"https://www.youtube.com/watch?v={vid}"})
        log("YouTube:", len(items), "items")
        return items
    except Exception as e:
        log("YouTube error:", repr(e))
        return []

def frequency_from_titles(items):
    counter = collections.Counter()
    bigram_counter = collections.Counter()
    for it in items:
        toks = tokenize(it["title"])
        counter.update(toks)
        bigram_counter.update(bigrams(toks))
    return counter, bigram_counter

def load_previous(path="data/trends.json"):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None

def main():
    log("Starting fetch...")
    sources = {
        "google_trends": fetch_google_trends(),
        "wikipedia": fetch_wikipedia_top(),
        "reddit": fetch_reddit(),
        "youtube": fetch_youtube_trending()
    }

    # Build corpus from titles
    corpus = []
    for arr in sources.values():
        corpus.extend(arr)
    log("Total titles:", len(corpus))

    kw_counter, bg_counter = frequency_from_titles(corpus)
    kw_list = sorted(kw_counter.items(), key=lambda x: x[1], reverse=True)
    bg_list = sorted(bg_counter.items(), key=lambda x: x[1], reverse=True)
    log("Unique keywords:", len(kw_list))

    # Velocity vs previous run
    prev = load_previous()
    prev_map = {w: c for w, c in (prev.get("keyword_frequencies", []) if prev else [])}
    velocity = [{"keyword": w, "delta": c - prev_map.get(w, 0)} for w, c in kw_list]
    velocity = [v for v in velocity if v["delta"] != 0]
    velocity_sorted = sorted(velocity, key=lambda x: x["delta"], reverse=True)

    out = {
        "generated_at": datetime.datetime.utcnow().isoformat() + "Z",
        "sources": sources,
        "keyword_frequencies": kw_list,
        "bigram_frequencies": bg_list,
        "keyword_velocity": velocity_sorted
    }

    os.makedirs("data", exist_ok=True)
    with open("data/trends.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    log("Wrote data/trends.json")

if __name__ == "__main__":
    main()
