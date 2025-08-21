import feedparser  # add at top with other imports

def fetch_google_trends_rss(geo="US"):
    """Google Trends daily via RSS (works reliably on Actions)."""
    url = f"https://trends.google.com/trends/trendingsearches/daily/rss?geo={geo}"
    items = []
    try:
        feed = feedparser.parse(url)
        for e in feed.entries[:50]:
            title = e.get("title") or ""
            # link back to Trends explore for this query
            q = quote(title)
            link = f"https://trends.google.com/trends/explore?q={q}"
            if title:
                items.append({"title": title, "url": link})
        log("GoogleTrends (RSS):", len(items), "items")
    except Exception as e:
        log("GoogleTrends (RSS) error:", repr(e))
    return items

def fetch_reddit_rss(subs=("news","worldnews","politics")):
    """Reddit via public RSS to avoid 429 on JSON."""
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
