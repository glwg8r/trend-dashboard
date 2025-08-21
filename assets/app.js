// CTA / GNN Dashboard front-end
// - reads data/trends.json (built by GitHub Actions)
// - renders Top Keywords, Word Cloud, Velocity
// - Explore grid shows live links from RSS categories
// - magenta scrolling ticker

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
      li.innerHTML = `<span class="kw">${escapeHtml(word)}</span> — <span class="count">${count}</span>`;
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

  // ----- Explore (live links) -----
  renderExploreLinks(data.sources || {}, data.source_counts || {});

  // ----- Ticker -----
  renderTicker(top);
}

// -------- helpers --------
function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function renderWordCloud(words) {
  const el = document.getElementById('wordCloud');
  if (!el) return;
  el.innerHTML = '';
  const w = el.clientWidth, h = el.clientHeight || 360;

  const palette = ['#ff00a8','#a4ff4f','#7f00ff','#ff0050','#ff6b00','#b87333','#f2efe8'];

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
    const svg = d3.select(el).append('svg').attr('width', w).attr('height', h);
    const g = svg.append('g').attr('transform', `translate(${w/2},${h/2})`);
    g.selectAll('text').data(words).enter().append('text')
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

  if (canvas._chart) canvas.__chart.destroy?.();

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

// ----- Explore: live links per category -----
function renderExploreLinks(sources, counts) {
  const grid = document.getElementById('exploreGrid');
  if (!grid) return;
  grid.innerHTML = '';

  // Which categories to show and how many links each
  const categories = [
    { key: 'google_trends', label: 'Google Trends (US)', max: 6, fallback: 'https://trends.google.com/trends/trendingsearches/daily?geo=US' },
    { key: 'major_outlets', label: 'Major Outlets',      max: 6, fallback: 'https://news.google.com/topstories?hl=en-US&gl=US&ceid=US:en' },
    { key: 'reddit',        label: 'Reddit (r/news·worldnews·politics)', max: 6, fallback: 'https://www.reddit.com/r/news/' },
    { key: 'tech',          label: 'Tech (HN · Techmeme)', max: 6, fallback: 'https://news.ycombinator.com/' },
    { key: 'wikipedia',     label: 'Wikipedia Top Reads', max: 6, fallback: 'https://en.wikipedia.org/wiki/Wikipedia:Top_25_Report' }
  ];

  categories.forEach(cat => {
    const list = Array.isArray(sources[cat.key]) ? sources[cat.key].slice(0, cat.max) : [];
    const tile = document.createElement('div');
    tile.className = 'explore-tile';

    // Header row with label + count
    const count = typeof counts[cat.key] === 'number' ? counts[cat.key] : (list.length || 0);
    tile.innerHTML = `
      <div class="explore-title">${cat.label}</div>
      <div class="explore-count">${count} items</div>
      <ul class="explore-list"></ul>
      <a class="explore-more" href="${cat.fallback}" target="_blank" rel="noopener noreferrer">Open source</a>
    `;

    const ul = tile.querySelector('.explore-list');
    if (list.length) {
      list.forEach(item => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = item.url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = item.title;
        li.appendChild(a);
        ul.appendChild(li);
      });
    } else {
      const li = document.createElement('li');
      li.innerHTML = `<span class="muted">No recent items</span>`;
      ul.appendChild(li);
    }

    grid.appendChild(tile);
  });
}

loadTrends().catch(console.error);
