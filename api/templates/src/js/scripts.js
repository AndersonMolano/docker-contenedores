/* ------------------------------------------------------------ formato */
const cop = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const num = new Intl.NumberFormat('es-CO');
const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const MESES_L = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const COLORES = ['#2f6fed', '#1f9d6b', '#f0a32b', '#d9485f', '#7b5cd6', '#2bb3c0'];
const TENUE = '#d5dbe7';
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fechaCorta = iso => { const [, m, d] = iso.split('-'); return `${+d} ${MESES[m - 1]}`; };
const nombreMes = ym => { const [y, m] = ym.split('-'); return `${MESES_L[m - 1]} ${y}`; };

/* ------------------------------------------------------------ estado */
const FILTROS = ['ciudad', 'categoria', 'mes', 'desde', 'hasta'];
const estado = { ciudad: '', categoria: '', mes: '', desde: '', hasta: '',
                 metrica: 'ingresos', granularidad: 'mes',
                 q: '', orden: 'id', dir: 'desc', pagina: 1, tamano: 10 };
// Leer el estado desde la URL (así se puede compartir una vista filtrada)
new URLSearchParams(location.search).forEach((v, k) => { if (k in estado) estado[k] = isNaN(estado[k]) ? v : +v || v; });

const params = keys => {
  const p = new URLSearchParams();
  keys.forEach(k => { if (estado[k] !== '' && estado[k] != null) p.set(k, estado[k]); });
  return p.toString();
};
const esIngresos = () => estado.metrica === 'ingresos';
const fmtMetrica = v => esIngresos() ? cop.format(v) : num.format(v) + ' u.';
const fmtEje = v => esIngresos() ? '$' + (v / 1e6).toLocaleString('es-CO', { maximumFractionDigits: 1 }) + ' M' : num.format(v);

function aplicar(cambios, mantenerPagina = false) {
  Object.assign(estado, cambios);
  if (!mantenerPagina) estado.pagina = 1;
  refrescar();
}

/* ------------------------------------------------------------ utilidades UI */
let tToast;
function toast(texto, error = false) {
  const t = $('toast');
  t.textContent = texto; t.className = 'toast ver' + (error ? ' error' : '');
  clearTimeout(tToast); tToast = setTimeout(() => t.className = 'toast', 2800);
}

const graficos = {};
function dibujar(id, config) {
  const g = graficos[id];
  if (g && g.config.type === config.type) {
    g.data = config.data; g.options = config.options; g.update();
  } else {
    if (g) g.destroy();
    graficos[id] = new Chart($(id), config);
  }
}
const cursor = (e, els) => e.native.target.style.cursor = els.length ? 'pointer' : 'default';

Chart.defaults.font.family = 'Inter, system-ui, sans-serif';
Chart.defaults.color = '#6b7489';

/* ------------------------------------------------------------ sincronizar controles */
function syncControles() {
  $('fCiudadF').value = estado.ciudad;
  $('fCategoriaF').value = estado.categoria;
  $('fDesde').value = estado.desde;
  $('fHasta').value = estado.hasta;
  $('buscar').value = estado.q;
  $('tamano').value = estado.tamano;
  document.querySelectorAll('#segMetrica button').forEach(b => b.classList.toggle('activo', b.dataset.v === estado.metrica));
  document.querySelectorAll('#segGran button').forEach(b => b.classList.toggle('activo', b.dataset.v === estado.granularidad));
  document.querySelectorAll('#cabTabla th[data-c]').forEach(th => {
    const base = th.textContent.replace(/ [▲▼]$/, '');
    th.textContent = base + (th.dataset.c === estado.orden ? (estado.dir === 'asc' ? ' ▲' : ' ▼') : '');
  });

  // Chips de filtros activos
  const etiquetas = { ciudad: v => 'Ciudad: ' + v, categoria: v => 'Categoría: ' + v, mes: v => 'Mes: ' + nombreMes(v),
                      desde: v => 'Desde ' + fechaCorta(v), hasta: v => 'Hasta ' + fechaCorta(v) };
  $('chips').innerHTML = FILTROS.filter(k => estado[k]).map(k =>
    `<span class="chip">${esc(etiquetas[k](estado[k]))}<button data-k="${k}" title="Quitar filtro">×</button></span>`).join('');
  $('btnLimpiar').disabled = !FILTROS.some(k => estado[k]);

  // URL compartible + enlace de exportación con los mismos filtros
  const qs = params([...FILTROS, 'metrica', 'granularidad']);
  history.replaceState(null, '', qs ? '?' + qs : location.pathname);
  $('btnCsv').href = '/api/exportar.csv' + (params(FILTROS) ? '?' + params(FILTROS) : '');
}

/* ------------------------------------------------------------ dashboard */
let kpisPrevios = null;
async function cargarDashboard() {
  const d = await (await fetch('/api/dashboard?' + params([...FILTROS, 'metrica', 'granularidad']))).json();
  const nm = esIngresos() ? 'Ingresos' : 'Unidades';

  // KPIs (se iluminan si cambian)
  const k = { kIngresos: cop.format(d.kpis.ingresos), kVentas: num.format(d.kpis.ventas),
              kUnidades: num.format(d.kpis.unidades), kTicket: cop.format(d.kpis.ticket_promedio) };
  Object.entries(k).forEach(([id, v]) => {
    const el = $(id);
    if (kpisPrevios && kpisPrevios[id] !== v) { el.classList.add('cambio'); setTimeout(() => el.classList.remove('cambio'), 900); }
    el.textContent = v;
  });
  kpisPrevios = k;

  // Serie de tiempo (drill-down: mes → día)
  const gran = estado.granularidad;
  const granTxt = { mes: 'mes', semana: 'semana', dia: 'día' }[gran];
  $('tituloSerie').innerHTML = `${nm} por ${granTxt}` + (estado.mes
    ? ` · ${nombreMes(estado.mes)} <button class="volver" id="btnVolver">← ver todos los meses</button>` : '');
  $('ayudaSerie').textContent = gran === 'mes' ? 'Clic en un mes para ver sus ventas día a día'
                              : gran === 'semana' ? 'Clic en una semana para filtrar esas fechas'
                              : 'Clic en un día para filtrar el detalle a esa fecha';
  if ($('btnVolver')) $('btnVolver').onclick = () => aplicar({ mes: '', granularidad: 'mes', desde: '', hasta: '' });

  const etiqueta = f => gran === 'mes' ? MESES[+f.slice(5, 7) - 1] : (gran === 'semana' ? 'Sem ' : '') + fechaCorta(f);
  dibujar('gSerie', {
    type: 'bar',
    data: { labels: d.serie.map(r => etiqueta(r[0])),
            datasets: [{ data: d.serie.map(r => r[1]), backgroundColor: COLORES[0], hoverBackgroundColor: '#1f56c9', borderRadius: 5 }] },
    options: {
      maintainAspectRatio: false, onHover: cursor,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ' ' + fmtMetrica(c.parsed.y) } } },
      scales: { y: { ticks: { callback: fmtEje }, grid: { color: '#eef1f6' } }, x: { grid: { display: false } } },
      onClick: (e, els) => {
        if (!els.length) return;
        const f = d.serie[els[0].index][0];
        if (gran === 'mes') aplicar({ mes: f.slice(0, 7), granularidad: 'dia' });
        else if (gran === 'semana') {
          const fin = new Date(f + 'T00:00:00'); fin.setDate(fin.getDate() + 6);
          aplicar({ desde: f, hasta: fin.toISOString().slice(0, 10) });
          $('detalle').scrollIntoView({ behavior: 'smooth' });
        } else { aplicar({ desde: f, hasta: f }); $('detalle').scrollIntoView({ behavior: 'smooth' }); }
      }
    }
  });

  // Categorías (dona) — resalta la seleccionada
  $('tituloCat').textContent = `${nm} por categoría`;
  const alternarCat = i => aplicar({ categoria: estado.categoria === d.por_categoria[i][0] ? '' : d.por_categoria[i][0] });
  dibujar('gCategoria', {
    type: 'doughnut',
    data: { labels: d.por_categoria.map(r => r[0]),
            datasets: [{ data: d.por_categoria.map(r => r[1]), borderWidth: 2,
                         backgroundColor: d.por_categoria.map((r, i) => !estado.categoria || estado.categoria === r[0] ? COLORES[i % 6] : TENUE),
                         offset: d.por_categoria.map(r => r[0] === estado.categoria ? 14 : 0) }] },
    options: { maintainAspectRatio: false, cutout: '60%', onHover: cursor,
               onClick: (e, els) => els.length && alternarCat(els[0].index),
               plugins: { legend: { position: 'right', onClick: (e, item) => alternarCat(item.index) },
                          tooltip: { callbacks: { label: c => ` ${c.label}: ${fmtMetrica(c.parsed)}` } } } }
  });

  // Ciudades (barras) — resalta la seleccionada
  $('tituloCiu').textContent = `${nm} por ciudad`;
  dibujar('gCiudad', {
    type: 'bar',
    data: { labels: d.por_ciudad.map(r => r[0]),
            datasets: [{ data: d.por_ciudad.map(r => r[1]), borderRadius: 6,
                         backgroundColor: d.por_ciudad.map(r => !estado.ciudad || estado.ciudad === r[0] ? COLORES[1] : TENUE) }] },
    options: { indexAxis: 'y', maintainAspectRatio: false, onHover: cursor,
               onClick: (e, els) => { if (!els.length) return; const c = d.por_ciudad[els[0].index][0];
                                      aplicar({ ciudad: estado.ciudad === c ? '' : c }); },
               plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ' ' + fmtMetrica(c.parsed.x) } } },
               scales: { x: { ticks: { callback: fmtEje, maxRotation: 0, autoSkipPadding: 12 }, grid: { color: '#eef1f6' } },
                         y: { grid: { display: false } } } }
  });

  // Top productos
  $('tTop').innerHTML = d.top_productos.length ? d.top_productos.map(r =>
    `<tr style="cursor:pointer" data-p="${esc(r[0])}"><td>${esc(r[0])}<div class="ayuda">${esc(r[1])}</div></td>
     <td class="num">${num.format(r[2])}</td><td class="num">${cop.format(r[3])}</td></tr>`).join('')
    : '<tr><td colspan="3" class="vacio">Sin datos</td></tr>';

  $('conexion').innerHTML = `Datos servidos por el contenedor <b>${esc(d.servidor.web)}</b> desde la base de datos en el contenedor <b>${esc(d.servidor.db)}</b> · <a href="/health">/health</a>`;
}

/* ------------------------------------------------------------ tabla de detalle */
let idNuevo = null;
async function cargarTabla() {
  const d = await (await fetch('/api/ventas?' + params([...FILTROS, 'q', 'orden', 'dir', 'pagina', 'tamano']))).json();
  const paginas = Math.max(1, Math.ceil(d.total / d.tamano));
  if (estado.pagina > paginas) { estado.pagina = paginas; return cargarTabla(); }

  $('tVentas').innerHTML = d.filas.length ? d.filas.map(r => `
    <tr class="${r[0] === idNuevo ? 'nueva' : ''}">
      <td>${r[0]}</td><td>${fechaCorta(r[1])}</td><td>${esc(r[2])}</td><td>${esc(r[3])}</td><td>${esc(r[4])}</td>
      <td class="num">${r[5]}</td><td class="num">${cop.format(r[6])}</td>
      <td><button class="borrar" data-id="${r[0]}" title="Eliminar venta">🗑</button></td>
    </tr>`).join('') : '<tr><td colspan="8" class="vacio">No hay ventas con estos filtros</td></tr>';
  idNuevo = null;

  const desde = d.total ? (d.pagina - 1) * d.tamano + 1 : 0;
  $('infoPag').textContent = `Mostrando ${num.format(desde)}–${num.format(Math.min(d.pagina * d.tamano, d.total))} de ${num.format(d.total)} ventas`;
  $('ayudaTabla').textContent = `${num.format(d.total)} ventas coinciden con los filtros`;
  $('numPag').textContent = `${d.pagina} / ${paginas}`;
  $('pagAnt').disabled = d.pagina <= 1;
  $('pagSig').disabled = d.pagina >= paginas;
}

async function refrescar() {
  syncControles();
  try {
    await Promise.all([cargarDashboard(), cargarTabla()]);
  } catch (e) {
    $('conexion').textContent = 'No se pudo conectar con la base de datos.';
    toast('Error al consultar la base de datos', true);
  }
}

/* ------------------------------------------------------------ eventos */
$('fCiudadF').onchange = e => aplicar({ ciudad: e.target.value });
$('fCategoriaF').onchange = e => aplicar({ categoria: e.target.value });
$('fDesde').onchange = e => aplicar({ desde: e.target.value });
$('fHasta').onchange = e => aplicar({ hasta: e.target.value });
$('segMetrica').onclick = e => e.target.dataset.v && aplicar({ metrica: e.target.dataset.v }, true);
$('segGran').onclick = e => e.target.dataset.v && aplicar({ granularidad: e.target.dataset.v }, true);
$('btnLimpiar').onclick = () => aplicar({ ciudad: '', categoria: '', mes: '', desde: '', hasta: '', q: '', granularidad: 'mes' });
$('chips').onclick = e => {
  const k = e.target.dataset.k; if (!k) return;
  aplicar(k === 'mes' ? { mes: '', granularidad: 'mes' } : { [k]: '' });
};
$('tTop').onclick = e => {
  const tr = e.target.closest('tr[data-p]'); if (!tr) return;
  aplicar({ q: tr.dataset.p }); $('detalle').scrollIntoView({ behavior: 'smooth' });
};

let tBuscar;
$('buscar').oninput = e => { clearTimeout(tBuscar); tBuscar = setTimeout(() => aplicar({ q: e.target.value.trim() }), 300); };
$('tamano').onchange = e => aplicar({ tamano: +e.target.value });
$('pagAnt').onclick = () => aplicar({ pagina: estado.pagina - 1 }, true);
$('pagSig').onclick = () => aplicar({ pagina: estado.pagina + 1 }, true);
$('cabTabla').onclick = e => {
  const c = e.target.dataset.c; if (!c) return;
  aplicar({ orden: c, dir: estado.orden === c && estado.dir === 'desc' ? 'asc' : 'desc' });
};

// Eliminar venta
$('tVentas').onclick = async e => {
  const id = e.target.dataset.id; if (!id) return;
  if (!confirm(`¿Eliminar la venta #${id}?`)) return;
  const r = await fetch('/api/ventas/' + id, { method: 'DELETE' });
  if (r.ok) { toast(`Venta #${id} eliminada de la base de datos`); refrescar(); }
  else toast((await r.json()).error, true);
};

// Nueva venta
$('btnNueva').onclick = () => { $('formVenta').classList.add('abierto'); $('nProducto').focus(); };
$('btnCancelar').onclick = () => $('formVenta').classList.remove('abierto');
$('formVenta').onsubmit = async e => {
  e.preventDefault();
  const r = await fetch('/api/ventas', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ producto_id: $('nProducto').value, ciudad: $('nCiudad').value,
                           cantidad: $('nCantidad').value, fecha: $('nFecha').value })
  });
  const res = await r.json();
  if (!r.ok) return toast(res.error, true);
  idNuevo = res.id;
  toast(`Venta #${res.id} guardada en la base de datos`);
  $('formVenta').classList.remove('abierto');
  aplicar({ orden: 'id', dir: 'desc', q: '' });
};

// Actualización en vivo: vuelve a consultar la base de datos cada 10 s
let tVivo = null;
$('vivo').onclick = e => {
  e.preventDefault();
  const on = !tVivo;
  $('vivo').classList.toggle('on', on);
  if (on) {
    const tick = () => { refrescar(); $('txtVivo').textContent = 'En vivo · ' + new Date().toLocaleTimeString('es-CO'); };
    tick(); tVivo = setInterval(tick, 10000);
  } else { clearInterval(tVivo); tVivo = null; $('txtVivo').textContent = 'Actualización en vivo: apagada'; }
};

/* ------------------------------------------------------------ inicio */
(async () => {
  try {
    const o = await (await fetch('/api/opciones')).json();
    o.ciudades.forEach(c => { $('fCiudadF').add(new Option(c, c)); $('nCiudad').add(new Option(c, c)); });
    o.categorias.forEach(c => $('fCategoriaF').add(new Option(c, c)));
    o.productos.forEach(p => $('nProducto').add(new Option(`${p.nombre} (${cop.format(p.precio)})`, p.id)));
    $('nFecha').value = new Date().toLocaleDateString('en-CA');
  } catch (e) { /* refrescar() mostrará el error */ }
  refrescar();
})();