const devices = window.DEVICES;
let selectedId = null;
const map = L.map('map', {scrollWheelZoom: false}).setView([47.67399, -122.12151], 12);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 19, attribution: '&copy; OpenStreetMap contributors'}).addTo(map);
const markers = new Map();

function markerIcon(device) {
  return L.divIcon({className: '', html: `<div class="pi-marker ${device.status}">⌁</div>`, iconSize: [34, 34], iconAnchor: [17, 17]});
}
function addMarkers() {
  devices.forEach((device) => {
    const marker = L.marker([device.lat, device.lng], {icon: markerIcon(device)}).addTo(map).bindPopup(`<b>${device.name}</b>${device.id} · ${device.status}`);
    marker.on('click', () => selectDevice(device.id)); markers.set(device.id, marker);
  });
}
function selectDevice(id) {
  const device = devices.find((item) => item.id === id); if (!device) return;
  selectedId = id; document.querySelector('.empty-state').classList.add('hidden'); document.querySelector('.device-detail').classList.remove('hidden');
  document.getElementById('device-id').textContent = device.id + ' · RASPBERRY PI'; document.getElementById('device-name').textContent = device.name; document.getElementById('device-location').textContent = '⌖  ' + device.location;
  const status = document.getElementById('device-status'); status.textContent = device.status; status.className = 'status-pill ' + device.status;
  document.getElementById('temp').textContent = device.temperature + '°C'; document.getElementById('humidity').textContent = device.humidity + '%'; document.getElementById('smoke').textContent = device.smoke + ' AQI'; document.getElementById('wind').textContent = device.wind + ' km/h'; document.getElementById('last-seen').textContent = device.last_seen;
  map.flyTo([device.lat, device.lng], 13); markers.get(id).openPopup(); document.querySelectorAll('.device-row').forEach((row) => row.style.background = row.dataset.deviceRow === id ? '#f1f5e9' : 'transparent');
}
function toast(message) { const el = document.querySelector('.toast'); el.textContent = message; el.classList.add('show'); clearTimeout(window.toastTimer); window.toastTimer = setTimeout(() => el.classList.remove('show'), 2800); }

addMarkers();
document.querySelectorAll('.device-row').forEach((row) => row.addEventListener('click', () => selectDevice(row.dataset.deviceRow)));
document.querySelectorAll('nav a').forEach((link) => link.addEventListener('click', () => { document.querySelectorAll('nav a').forEach((item) => item.classList.remove('active')); link.classList.add('active'); }));
document.querySelectorAll('[data-action]').forEach((button) => button.addEventListener('click', async () => { if (!selectedId) return toast('Select a device first.'); const action = button.dataset.action; button.disabled = true; try { const response = await fetch(`/api/devices/${selectedId}/action`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({action})}); const result = await response.json(); toast(result.message || 'Action sent.'); } catch { toast('Unable to reach the device.'); } button.disabled = false; }));
document.getElementById('centerMap').addEventListener('click', () => map.fitBounds([...markers.values()].map((marker) => marker.getLatLng()), {padding:[35,35]}));
document.getElementById('filterButton').addEventListener('click', () => toast('Showing all nearby devices.'));
function updateAlertCount() { const unacknowledged = document.querySelectorAll('.alert-row[data-unacknowledged="true"]').length; const open = document.querySelectorAll('.alert-row:not(.resolved)').length; const badge = document.getElementById('alertBadge'); badge.textContent = unacknowledged; badge.classList.toggle('hidden-badge', unacknowledged === 0); document.getElementById('openAlerts').textContent = open; document.getElementById('alertSummary').textContent = open ? `${open} open` : 'All clear'; }
document.querySelectorAll('[data-acknowledge]').forEach((button) => button.addEventListener('click', async () => { button.disabled = true; try { const response = await fetch(`/api/alerts/${button.dataset.acknowledge}/acknowledge`, {method: 'POST'}); const result = await response.json(); if (!response.ok) throw new Error(result.error); const row = button.closest('.alert-row'); row.classList.add('acknowledged'); row.dataset.unacknowledged = 'false'; const label = document.createElement('span'); label.className = 'acknowledged-label'; label.textContent = 'Acknowledged'; button.replaceWith(label); updateAlertCount(); toast(result.message); } catch { button.disabled = false; toast('Unable to update this alert.'); } }));
window.addEventListener('resize', () => map.invalidateSize());
