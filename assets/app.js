async function loadTrends() {
  const res = await fetch('data/trends.json', { cache: 'no-store' });
  const data = await res.json();

  document.getElementById('lastUpdated').textContent =
    new Date(data.generated_at).toLocaleString();

  const top = (data.keyword_frequencies || []).slice(0, 20);

  // Top Keywords
  const topList = document.getElementById('topKeywords');
  topList.innerHTML = '';
  top.forEach(([word, count]) => {
    const li = document.createElement('li');
    li.innerHTML = `<span style="color:#b87333">${word}</span> — <span style="color:#a4ff4f">${count}</span>`;
    topList.appendChild(li);
  });

  renderWordCloud(top.map(([text, size]) => ({ text, size: 10 + Math.sqrt(size) * 12 })));
  renderVelocity((data.keyword_velocity || []).slice(0, 16));

  renderList('googleTrends', (data.sources?.google_trends || []).slice(0, 10));
  renderList('wikiTrends', (data.sources?.wikipedia || []).slice(0, 10));
  renderList('redditTrends', (data.sources?.reddit || []).slice(0, 12));
  renderList('ytTrends', (data.sources?.youtube || []).slice(0, 10));

  // Build the ticker
  renderTicker(top);
}

function renderList(id, items) {
  const el = document.getElementById(id);
  el.innerHTML = '';
  items.forEach(item => {
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
  el.innerHTML = '';
  const w = el.clientWidth, h = el.clientHeight;

  const palette = [
    '#ff00a8', // magenta
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
  const ctx = document.getElementById('velocityChart').getContext('2d');
  const labels = velocity.map(v => v.keyword);
  const values = velocity.map(v => v.delta);

  new Chart(ctx, {
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

function renderTicker(topKeywords) {
  const track = document.getElementById('tickerTrack');
  if (!track) return;
  const items = (topKeywords || []).slice(0, 20);

  const makeRow = () => {
    const frag = document.createDocumentFragment();
    items.forEach(([word, count]) => {
      const span = document.createElement('span');
      span.className = 'ticker-item';
      span.innerHTML = `${word}<span class="badge">${count}</span>`;
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

loadTrends().catch(console.error);
