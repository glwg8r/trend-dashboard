import os, json, re, collections, datetime, sys, time
from urllib.parse import quote
import requests
import feedparser

# ----- logging -----
def log(*args):
    print("[trends]", *args); sys.stdout.flush()

HEADERS = {"User-Agent": "GNN-Trends/1.0 (+github actions)"}
YT_API_KEY = os.getenv("YT_API_KEY")  # optional

STOPWORDS = set("""
a an the and or of to in for on with by from at as is are was were be been being this that these those
i you he she it we they them us our your their not but if then than so such about into over under out up down
how what when where which who whom why will would can could should may might just more most many much rt amp
""".split())

def tokenize(text: str):
    text = text.lower()
    text = re.sub(r"http\S+|www\.\S+", "", text)
    text = re.sub(r"[^a-z0-9\s\-#_+]", " ", text)
    toks = [t.strip("-_+") for t in text.split()]
    return [t for t in toks if t and t not in STOPWORDS and not t.isdigit() and len(t) > 2]

def bigrams(tokens):
    return [" ".join(pair) for pair in zip(tokens, tokens[1:])]

# ----- SOURCES -----
def fetch_google_trends_rss(geo="US"):
    """Google Trends daily via RSS (no keys; reliable)."""
    url = f"https://trends.google.com/trends/trendingsearches/daily/rss?geo={geo}"
    items = []
    try:
        feed = feedparser.parse(url)
        for e in feed.entries[:50]:
            title = (e.get("title") or "").strip()
            if not title: continue
            link = f"https://trends.google.com/trends/explore?q={quote(title)}"
            items.append({"title": title, "url": link})
        log("GoogleTrends (RSS):", len(items), "items")
    except Exception as e:
        log("GoogleTrends (RSS) error:", repr(e))
    return items

def fetch_wikipedia_top():
    """Try yesterday; if empty, go back up to 3 days."""
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

def fetch_reddit_rss(subs=("news","worldnews","politics")):
    """Reddit via RSS to avoid 429s."""
    items = []
    for sub in subs:
        url = f"https://www.reddit.com/r/{sub}/hot/.rss"
        try:
            feed = feedparser.parse(url)
            for e in feed.entries[:50]:
                title = (e.get("title") or "").strip()
                link = e.get("link") or ""
                if title and link:
                    items.append({"title": title, "url": link})
        except Exception as e:
            log(f"Reddit RSS /r/{sub} error:", repr(e))
            continue
    log("Reddit (RSS):", len(items), "items")
    return items

def fetch_youtube_trending(region="US"):
    if not YT_API_KEY:
        log("YouTube: no API key; skipping."); return []
    try:
        url = ("https://www.googleapis.com/youtube/v3/videos"
               f"?part=snippet,statistics&chart=mostPopular&regionCode={region}&maxResults=50&key={YT_API_KEY}")
        r = requests.get(url, timeout=25)
        if r.status_code != 200:
            log("YouTube status:", r.status_code, r.text[:200]); return []
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

# ----- PROCESSING -----
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
    sources = {
        "google_trends": fetch_google_trends_rss("US"),
        "wikipedia": fetch_wikipedia_top(),
        "reddit": fetch_reddit_rss(),
        "youtube": fetch_youtube_trending()
    }

    corpus = [it for arr in sources.values() for it in arr]
    log("Total titles:", len(corpus))

    kw_counter, bg_counter = frequency_from_titles(corpus)
    kw_list = sorted(kw_counter.items(), key=lambda x: x[1], reverse=True)
    bg_list = sorted(bg_counter.items(), key=lambda x: x[1], reverse=True)
    log("Unique keywords:", len(kw_list))

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

    # If still nothing, write a small demo so UI shows data
    if not corpus:
        log("No data fetched; writing demo placeholder.")
        out["sources"] = {
            "google_trends": [{"title":"Example Topic One","url":"https://example.com"}],
            "wikipedia": [{"title":"Example Topic Two","url":"https://example.com"}],
            "reddit": [{"title":"Example Topic Three","url":"https://example.com"}],
            "youtube": []
        }
        out["keyword_frequencies"] = [["example",3],["topic",3],["one",1],["two",1],["three",1]]

    os.makedirs("data", exist_ok=True)
    with open("data/trends.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    log("Wrote data/trends.json")

if __name__ == "__main__":
    main()
