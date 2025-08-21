import json, os, requests
from datetime import datetime, timezone
from pytrends.request import TrendReq

def fetch_google_trends():
    try:
        pytrend = TrendReq(hl='en-US', tz=360)
        df = pytrend.trending_searches(pn='united_states')
        return df[0].tolist() if not df.empty else []
    except Exception as e:
        print("Google Trends error:", e)
        return []

def fetch_wikipedia():
    try:
        url = "https://wikimedia.org/api/rest_v1/metrics/pageviews/top/en.wikipedia/all-access/1"
        res = requests.get(url, timeout=10)
        res.raise_for_status()
        data = res.json()
        return [a["article"] for a in data["items"][0]["articles"][:20]]
    except Exception as e:
        print("Wikipedia error:", e)
        return []

def fetch_reddit(subs=("news","worldnews")):
    results = []
    try:
        for sub in subs:
            url = f"https://www.reddit.com/r/{sub}/hot.json?limit=10"
            res = requests.get(url, headers={"User-Agent":"trend-dashboard"}, timeout=10)
            res.raise_for_status()
            posts = res.json()["data"]["children"]
            results.extend([p["data"]["title"] for p in posts])
        return results
    except Exception as e:
        print("Reddit error:", e)
        return []

def fetch_youtube():
    key = os.getenv("YT_API_KEY")
    if not key:
        return []
    try:
        url = f"https://www.googleapis.com/youtube/v3/videos?part=snippet&chart=mostPopular&regionCode=US&maxResults=10&key={key}"
        res = requests.get(url, timeout=10)
        res.raise_for_status()
        items = res.json().get("items", [])
        return [i["snippet"]["title"] for i in items]
    except Exception as e:
        print("YouTube error:", e)
        return []

def build_keyword_freqs(sources):
    words = {}
    for values in sources.values():
        for v in values:
            for w in v.split():
                w = w.lower().strip(".,!?\"'()[]{}")
                if len(w) > 3:
                    words[w] = words.get(w, 0) + 1
    return sorted(words.items(), key=lambda x: x[1], reverse=True)

def main():
    sources = {
        "google_trends": fetch_google_trends(),
        "wikipedia": fetch_wikipedia(),
        "reddit": fetch_reddit(),
        "youtube": fetch_youtube()
    }
    freqs = build_keyword_freqs(sources)

    data = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "sources": sources,
        "keyword_frequencies": freqs,
        "bigram_frequencies": [],
        "keyword_velocity": []  # could be added later
    }

    os.makedirs("data", exist_ok=True)
    with open("data/trends.json", "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    print("Wrote data/trends.json with", len(freqs), "keywords")

if __name__ == "__main__":
    main()
