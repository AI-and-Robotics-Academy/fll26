const resources = window.RESOURCE_DATA || [];
const statusValues = ["Available", "In Use", "Low Supply", "Needs Maintenance", "Offline"];
const markers = new Map();
let selectedResourceId = null;

const map = L.map('resourceMap', { scrollWheelZoom: false }).setView([47.67399, -122.12151], 12);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

function slugStatus(status) {
  return status.toLowerCase().replace(/\s+/g, '-');
}

function statusColor(status) {
  const token = slugStatus(status);
  if (token === 'available') return '#2f6f4e';
  if (token === 'in-use') return '#bf7623';
  if (token === 'low-supply') return '#c07428';
  if (token === 'needs-maintenance') return '#8a6a2d';
  return '#74827b';
}

function markerIcon(status) {
  return L.divIcon({
    className: '',
    html: `<div class="resource-marker" style="background:${statusColor(status)}">R</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  });
}

function updateFromSensors() {
  return null;
}

function syncWithFirefighterMap() {
  return null;
}

function syncWithDeviceManager() {
  return null;
}

function renderList() {
  const listEl = document.getElementById('resourceList');
  listEl.innerHTML = '';
  resources.forEach((resource) => {
    const item = document.createElement('button');
    item.className = `resource-item ${resource.id === selectedResourceId ? 'active' : ''}`;
    item.innerHTML = `<b>${resource.id}</b><small>${resource.type.replace(/_/g, ' ')} - ${resource.status}</small>`;
    item.addEventListener('click', () => selectResource(resource.id));
    listEl.appendChild(item);
  });
}

function renderDrawer(resource) {
  const empty = document.getElementById('drawerEmpty');
  const content = document.getElementById('drawerContent');
  if (!resource) {
    empty.classList.remove('hidden');
    content.classList.add('hidden');
    return;
  }

  empty.classList.add('hidden');
  content.classList.remove('hidden');
  document.getElementById('resourceType').textContent = resource.type.replace(/_/g, ' ');
  document.getElementById('resourceId').textContent = resource.id;

  const statusEl = document.getElementById('resourceStatus');
  statusEl.textContent = resource.status;
  statusEl.className = `status-badge status-${slugStatus(resource.status)}`;

  document.getElementById('resourceCoord').textContent = `Lat ${resource.location.lat.toFixed(3)}, Lng ${resource.location.lng.toFixed(3)}`;

  const capacityEl = document.getElementById('resourceCapacity');
  capacityEl.innerHTML = '';
  Object.entries(resource.capacity || {}).forEach(([key, value]) => {
    const li = document.createElement('li');
    li.textContent = `${key.replace(/_/g, ' ')}: ${value}`;
    capacityEl.appendChild(li);
  });

  document.getElementById('resourceUpdated').textContent = resource.lastUpdated;
}

function selectResource(resourceId) {
  selectedResourceId = resourceId;
  const resource = resources.find((item) => item.id === resourceId);
  renderList();
  renderDrawer(resource);
  if (!resource) return;
  const marker = markers.get(resource.id);
  if (marker) {
    marker.openPopup();
    map.flyTo([resource.location.lat, resource.location.lng], 13);
  }
}

function renderMap() {
  resources.forEach((resource) => {
    const marker = L.marker([resource.location.lat, resource.location.lng], {
      icon: markerIcon(resource.status)
    }).addTo(map).bindPopup(`<b>${resource.id}</b><br>${resource.type.replace(/_/g, ' ')}<br>${resource.status}`);
    marker.on('click', () => selectResource(resource.id));
    markers.set(resource.id, marker);
  });

  if (resources.length) {
    const points = resources.map((item) => [item.location.lat, item.location.lng]);
    map.fitBounds(points, { padding: [30, 30] });
  }
}

function randomStep() {
  const index = Math.floor(Math.random() * resources.length);
  const chosen = resources[index];
  if (!chosen) return;

  const doMove = Math.random() > 0.5;
  if (doMove) {
    chosen.location.lat = Number((chosen.location.lat + (Math.random() - 0.5) * 0.012).toFixed(6));
    chosen.location.lng = Number((chosen.location.lng + (Math.random() - 0.5) * 0.012).toFixed(6));
  } else {
    const nextStatus = statusValues[Math.floor(Math.random() * statusValues.length)];
    chosen.status = nextStatus;
  }

  chosen.lastUpdated = new Date().toISOString();
  const marker = markers.get(chosen.id);
  if (marker) {
    marker.setLatLng([chosen.location.lat, chosen.location.lng]);
    marker.setIcon(markerIcon(chosen.status));
    marker.setPopupContent(`<b>${chosen.id}</b><br>${chosen.type.replace(/_/g, ' ')}<br>${chosen.status}`);
  }

  if (selectedResourceId === chosen.id) {
    renderDrawer(chosen);
  }
  renderList();

  updateFromSensors();
  syncWithFirefighterMap();
  syncWithDeviceManager();
}

renderMap();
renderList();
renderDrawer(null);
setInterval(randomStep, 10000);
window.addEventListener('resize', () => map.invalidateSize());
