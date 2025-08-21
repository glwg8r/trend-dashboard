// GNN Trend Dashboard – front-end
// - reads data/trends.json
// - renders Top Keywords, Word Cloud, Velocity
// - shows an "Explore Sources" grid (always populated)
// - runs a magenta scrolling ticker

async function loadTrends() {
  const res = await fetch('data/trends.json', { cache: 'no-store' });
  const data = await res.json();

  // Last updated
  const ts = document.getElementById('lastUpdated');
  if (ts) ts.textContent = new Date(data.generated_at).toLocaleString();

  // ----- Top keywords -----
  const top = (data.keyword_frequencies || []).slice(0, 20);
  const topList = document.getElementById('topKeywords');
  if (topList) {
    topList.innerHTML = '';
    top.forEach(([word, count]) => {
      const li = document.createElement('li');
      li.innerHTML = `<span style="color:#b87333">${escapeHtml(word)}</span> — <span style="color:#a4ff4f">${count}</span>`;
      topList.appendChild(li);
    });
  }

  // ----- Word cloud -----
  renderWordCloud(top.map(([text, size]) => ({
    text,
    size: 10 + Math.sqrt(size) * 12
  })));

  // ----- Velocity -----
  const velocity = (data.keyword_velocity || []).slice(0, 16);
  renderVelocity(velocity);

  // ----- Explore Sources tiles -----
  renderExplore(data.source_counts || {});

  // ----- Ticker -----
  renderTicker(top);
}

// -------- helpers --------
function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function renderList(id, items) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = '';
  (items || []).forEach(item => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = item.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = item.title;
    li.appendChild(a);
    el.appendChild(li);
  });
}

function renderWordCloud(words) {
  const el = document.getElementById('wordCloud');
  if (!el) return;
  el.innerHTML = '';
  const w = el.clientWidth, h = el.clientHeight || 360;

  const palette = [
    '#ff00a8', // magenta (brand)
    '#a4ff4f', // lime
    '#7f00ff', // ultraviolet
    '#ff0050', // infrared
    '#ff6b00', // solar orange
    '#b87333', // copper
    '#f2efe8'  // eggshell
  ];

  d3.layout.cloud()
    .size([w, h])
    .words(words)
    .padding(5)
    .rotate(() => (Math.random() < 0.15 ? 90 : 0))
    .font('Inter, system-ui, sans-serif')
    .fontSize(d => d.size)
    .on('end', draw)
    .start();

  function draw(words) {
    const svg = d3.select(el).append('svg')
      .attr('width', w).attr('height', h);
    const g = svg.append('g').attr('transform', `translate(${w/2},${h/2})`);

    g.selectAll('text')
      .data(words)
      .enter()
      .append('text')
      .style('font-family', 'Inter, system-ui, sans-serif')
      .style('fill', () => palette[Math.floor(Math.random() * palette.length)])
      .style('opacity', 0.95)
      .attr('text-anchor', 'middle')
      .attr('transform', d => `translate(${[d.x, d.y]})rotate(${d.rotate})`)
      .style('font-size', d => `${d.size}px`)
      .text(d => d.text);
  }
}

function renderVelocity(velocity) {
  const canvas = document.getElementById('velocityChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const labels = velocity.map(v => v.keyword);
  const values = velocity.map(v => v.delta);

  // destroy old chart if re-rendering
  if (canvas._chart) {
    canvas._chart.destroy();
  }

  canvas._chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Δ since last run',
        data: values,
        backgroundColor: values.map(v => v >= 0 ? '#ff00a8' : '#ff0050'),
        borderColor: '#1b1f2b',
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      animation: { duration: 400 },
      scales: {
        x: { ticks: { color: '#f2efe8' }, grid: { color: '#202433' } },
        y: { beginAtZero: true, ticks: { color: '#f2efe8' }, grid: { color: '#202433' } }
      },
      plugins: {
        legend: { labels: { color: '#f2efe8' } },
        tooltip: { callbacks: { label: ctx => ` Δ ${ctx.raw}` } }
      }
    }
  });
}

// ----- Ticker -----
function renderTicker(topKeywords) {
  const track = document.getElementById('tickerTrack');
  if (!track) return;
  const items = (topKeywords || []).slice(0, 20);

  const makeRow = () => {
    const frag = document.createDocumentFragment();
    items.forEach(([word, count]) => {
      const span = document.createElement('span');
      span.className = 'ticker-item';
      span.innerHTML = `${escapeHtml(word)}<span class="badge">${count}</span>`;
      frag.appendChild(span);

      const sep = document.createElement('span');
      sep.className = 'ticker-sep';
      sep.textContent = '•';
      frag.appendChild(sep);
    });
    return frag;
  };

  track.innerHTML = '';
  track.appendChild(makeRow());
  track.appendChild(makeRow());
}

// ----- Explore Sources (always visible) -----
function renderExplore(counts) {
  const grid = document.getElementById('exploreGrid');
  if (!grid) return;
  grid.innerHTML = '';

  const tiles = [
    { key: 'google_trends', label: 'Google Trends (US)', url: 'https://trends.google.com/trends/trendingsearches/daily?geo=US' },
    { key: 'google_news',   label: 'Google News – Top', url: 'https://news.google.com/topstories?hl=en-US&gl=US&ceid=US:en' },
    { key: 'reddit',        label: 'Reddit r/news',      url: 'https://www.reddit.com/r/news/' },
    { key: 'reddit',        label: 'Reddit r/worldnews', url: 'https://www.reddit.com/r/worldnews/' },
    { key: 'reddit',        label: 'Reddit r/politics',  url: 'https://www.reddit.com/r/politics/' },
    { key: 'tech',          label: 'Hacker News',        url: 'https://news.ycombinator.com/' },
    { key: 'tech',          label: 'Techmeme',           url: 'https://www.techmeme.com/' },
    { key: 'major_outlets', label: 'BBC World',          url: 'https://www.bbc.co.uk/news/world' },
    { key: 'major_outlets', label: 'Reuters World',      url: 'https://www.reuters.com/world/' },
    { key: 'major_outlets', label: 'NPR Top',            url: 'https://www.npr.org/sections/news/' },
    { key: 'major_outlets', label: 'The Guardian World', url: 'https://www.theguardian.com/world' },
    { key: 'major_outlets', label: 'AP Top News',        url: 'https://apnews.com/hub/ap-top-news' },
    { key: 'wikipedia',     label: 'Wikipedia Top Reads', url: 'https://en.wikipedia.org/wiki/Wikipedia:Top_25_Report' }
  ];

  tiles.forEach(t => {
    const a = document.createElement('a');
    a.href = t.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.className = 'explore-tile';

    const count = counts[t.key];
    a.innerHTML = `
      <div class="explore-title">${t.label}</div>
      ${typeof count === 'number' ? `<div class="explore-count">${count} items</div>` : ''}
    `;
    grid.appendChild(a);
  });
}

loadTrends().catch(console.error);
