import os, json, re, collections, datetime, sys, time
from urllib.parse import quote
import requests
import feedparser

# ---------- logging ----------
def log(*args):
    print("[trends]", *args); sys.stdout.flush()

HEADERS = {"User-Agent": "GNN-Trends/1.0 (+github actions)"}
YT_API_KEY = os.getenv("YT_API_KEY")  # optional

STOPWORDS = set("""
a an the and or of to in for on with by from at as is are was were be been being this that these those
i you he she it we they them us our your their not but if then than so such about into over under out up down
how what when where which who whom why will would can could should may might just more most many much rt amp via
""".split())

# ---------- tokenization ----------
def tokenize(text: str):
    text = text.lower()
    text = re.sub(r"http\S+|www\.\S+", "", text)
    text = re.sub(r"[^a-z0-9\s\-#_+]", " ", text)
    toks = [t.strip("-_+") for t in text.split()]
    return [t for t in toks if t and t not in STOPWORDS and not t.isdigit() and len(t) > 2]

def bigrams(tokens):
    return [" ".join(pair) for pair in zip(tokens, tokens[1:])]

# ---------- source fetchers ----------
def fetch_wikipedia_top():
    """Top enwiki most-read (yesterday fallback back to 3d)."""
    for delta in range(1, 4):
        try:
            dt = datetime.datetime.utcnow() - datetime.timedelta(days=delta)
            y, m, d = dt.strftime("%Y"), dt.strftime("%m"), dt.strftime("%d")
            url = f"https://wikimedia.org/api/rest_v1/metrics/pageviews/top/en.wikipedia/all-access/{y}/{m}/{d}"
            r = requests.get(url, timeout=20, headers=HEADERS)
            if r.status_code != 200:
                log(f"Wikipedia {y}-{m}-{d} status:", r.status_code)
                continue
            data = r.json()
            items = []
            for a in data.get("items", [])[0].get("articles", [])[:100]:
                title = a.get("article", "").replace("_", " ")
                if title and title.lower() != "main page":
                    items.append({"title": title, "url": f"https://en.wikipedia.org/wiki/{quote(a.get('article',''))}"})
            if items:
                log("Wikipedia:", len(items), f"items (date {y}-{m}-{d})")
                return items
        except Exception as e:
            log("Wikipedia error:", repr(e)); time.sleep(1)
    return []

def fetch_rss(url, per_feed_limit=30):
    items = []
    try:
        feed = feedparser.parse(url)
        for e in feed.entries[:per_feed_limit]:
            title = (e.get("title") or "").strip()
            link = e.get("link") or ""
            if title and link:
                items.append({"title": title, "url": link})
    except Exception as e:
        log("RSS error:", url, "->", repr(e))
    return items

def dedupe_by_title(items):
    seen, out = set(), []
    for it in items:
        key = it["title"].lower()
        if key in seen: 
            continue
        seen.add(key)
        out.append(it)
    return out

# ---------- feed sets (US; tweak to taste) ----------
FEEDS = {
    "google_trends": [  # Trends daily RSS -> link back to explore
        "https://trends.google.com/trends/trendingsearches/daily/rss?geo=US"
    ],
    "reddit": [
        "https://www.reddit.com/r/news/hot/.rss",
        "https://www.reddit.com/r/worldnews/hot/.rss",
        "https://www.reddit.com/r/politics/hot/.rss"
    ],
    "tech": [
        "https://hnrss.org/frontpage",
        "https://www.techmeme.com/feed.xml"
    ],
    "major_outlets": [
        "https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en",
        "http://feeds.bbci.co.uk/news/world/rss.xml",
        "https://www.reuters.com/world/rss",
        "https://feeds.npr.org/1001/rss.xml",
        "https://www.theguardian.com/world/rss",
        "https://apnews.com/hub/ap-top-news?utm_source=apnews.com&utm_medium=referral&utm_campaign=rss"
    ]
    # YouTube trending has no reliable RSS; keep optional API in UI if desired.
}

# Optional YouTube (kept for completeness; fine if empty)
def fetch_youtube_trending(region="US"):
    if not YT_API_KEY:
        return []
    try:
        url = ("https://www.googleapis.com/youtube/v3/videos"
               f"?part=snippet,statistics&chart=mostPopular&regionCode={region}&maxResults=50&key={YT_API_KEY}")
        r = requests.get(url, timeout=25)
        if r.status_code != 200:
            log("YouTube status:", r.status_code); return []
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
        log("YouTube error:", repr(e)); return []

# ---------- processing ----------
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
    log("Starting fetch…")

    # Pull each category of feeds
    collected = {}
    for cat, urls in FEEDS.items():
        bucket = []
        for u in urls:
            bucket.extend(fetch_rss(u, per_feed_limit=30))
        collected[cat] = dedupe_by_title(bucket)
        log(f"{cat}:", len(collected[cat]), "items")

    # Add Wikipedia + optional YouTube as separate categories
    collected["wikipedia"] = fetch_wikipedia_top()
    collected["youtube"]   = fetch_youtube_trending()

    # Build corpus for keywords
    corpus = [it for arr in collected.values() for it in arr]
    log("Total titles:", len(corpus))

    kw_counter, bg_counter = frequency_from_titles(corpus)
    kw_list = sorted(kw_counter.items(), key=lambda x: x[1], reverse=True)
    bg_list = sorted(bg_counter.items(), key=lambda x: x[1], reverse=True)

    # Velocity vs previous run
    prev = load_previous()
    prev_map = {w: c for w, c in (prev.get("keyword_frequencies", []) if prev else [])}
    velocity = [{"keyword": w, "delta": c - prev_map.get(w, 0)} for w, c in kw_list]
    velocity = [v for v in velocity if v["delta"] != 0]
    velocity_sorted = sorted(velocity, key=lambda x: x["delta"], reverse=True)

    # Simple counts per category for the UI Explore section
    source_counts = {k: len(v) for k, v in collected.items()}

    out = {
        "generated_at": datetime.datetime.utcnow().isoformat() + "Z",
        "sources": collected,             # each category: [{title,url},...]
        "source_counts": source_counts,   # just the tallies
        "keyword_frequencies": kw_list,
        "bigram_frequencies": bg_list,
        "keyword_velocity": velocity_sorted
    }

    # Write
    os.makedirs("data", exist_ok=True)
    with open("data/trends.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    log("Wrote data/trends.json")

if __name__ == "__main__":
    main()
