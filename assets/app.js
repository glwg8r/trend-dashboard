// CTA / GNN Dashboard front-end

async function loadTrends() {
  const res = await fetch('data/trends.json', { cache: 'no-store' });
  const data = await res.json();

  const ts = document.getElementById('lastUpdated');
  if (ts) ts.textContent = new Date(data.generated_at).toLocaleString();

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

  syncTallHeights();
  renderWordCloud(top.map(([text, size]) => ({ text, size: 10 + Math.sqrt(size) * 12 })));

  const velocity = (data.keyword_velocity || []).slice(0, 16);
  renderVelocity(velocity);

  renderExploreLinks(data.sources || {}, data.source_counts || {});
  renderTicker(top);
}

function syncTallHeights() {
  const cloud = document.getElementById('cloudCard');
  const mascot = document.getElementById('mascotCard');
  if (!cloud || !mascot) return;
  const h = cloud.getBoundingClientRect().height;
  mascot.style.height = `${h}px`;
  const img = mascot.querySelector('.mascot-img');
  if (img) {
    img.style.height = `calc(${h}px - 48px)`;
    img.style.objectFit = 'contain';
  }
}

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
  const w = el.clientWidth, h = el.clientHeight || 480;

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

// —— FIX: no animation, no responsive resize loops
function renderVelocity(velocity) {
  const canvas = document.getElementById('velocityChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // Set explicit size; prevent resize observer churn
  canvas.width = canvas.clientWidth;
  canvas.height = 220;

  const labels = velocity.map(v => v.keyword);
  const values = velocity.map(v => v.delta);

  if (canvas._chart) canvas._chart.destroy();

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
      responsive: false,           // <— stop auto-resize loop
      animation: false,            // <— no repeat animations
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

// —— Ticker (magenta words; half speed; pause on hover via CSS)
function renderTicker(topKeywords) {
  const track = document.getElementById('tickerTrack');
  if (!track) return;
  const items = (topKeywords || []).slice(0, 24);

  const frag = document.createDocumentFragment();
  const build = () => {
    const f = document.createDocumentFragment();
    items.forEach(([word, count], i) => {
      const span = document.createElement('span');
      span.className = 'ticker-item';
      span.innerHTML = `<span class="ticker-word">${escapeHtml(word)}</span><span class="badge">${count}</span>`;
      f.appendChild(span);
      if (i !== items.length - 1) {
        const sep = document.createElement('span');
        sep.className = 'ticker-sep';
        sep.textContent = '•';
        f.appendChild(sep);
      }
    });
    return f;
  };
  track.innerHTML = '';
  track.appendChild(build());
  track.appendChild(build());
}

// —— Explore: live links (Google Trends removed)
function renderExploreLinks(sources, counts) {
  const grid = document.getElementById('exploreGrid');
  if (!grid) return;
  grid.innerHTML = '';

  const categories = [
    { key: 'major_outlets', label: 'Major Outlets',      max: 6, fallback: 'https://news.google.com/topstories?hl=en-US&gl=US&ceid=US:en' },
    { key: 'reddit',        label: 'Reddit (r/news · worldnews · politics)', max: 6, fallback: 'https://www.reddit.com/r/news/' },
    { key: 'tech',          label: 'Tech (HN · Techmeme)', max: 6, fallback: 'https://news.ycombinator.com/' },
    { key: 'wikipedia',     label: 'Wikipedia Top Reads', max: 6, fallback: 'https://en.wikipedia.org/wiki/Wikipedia:Top_25_Report' }
  ];

  categories.forEach(cat => {
    const list = Array.isArray(sources[cat.key]) ? sources[cat.key].slice(0, cat.max) : [];
    const tile = document.createElement('div');
    tile.className = 'explore-tile';

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

window.addEventListener('resize', syncTallHeights);
loadTrends().catch(console.error);
