import { useEffect, useMemo, useState } from 'react';
import resourcesSeed from '../data/resources.json';

const statuses = ['Available', 'In Use', 'Low Supply', 'Needs Maintenance', 'Offline'];

function statusClass(status) {
  return `status-${status.toLowerCase().replace(/\s+/g, '-')}`;
}

function randomizeResource(resource) {
  const clone = structuredClone(resource);
  if (Math.random() > 0.5) {
    clone.location.lat = Number((clone.location.lat + (Math.random() - 0.5) * 0.012).toFixed(6));
    clone.location.lng = Number((clone.location.lng + (Math.random() - 0.5) * 0.012).toFixed(6));
  } else {
    clone.status = statuses[Math.floor(Math.random() * statuses.length)];
  }
  clone.lastUpdated = new Date().toISOString();
  return clone;
}

export default function ResourceTracker() {
  const [resources, setResources] = useState(resourcesSeed);
  const [selectedId, setSelectedId] = useState(resourcesSeed[0]?.id ?? null);

  function updateFromSensors() {
    return null;
  }

  function syncWithFirefighterMap() {
    return null;
  }

  function syncWithDeviceManager() {
    return null;
  }

  useEffect(() => {
    const timer = setInterval(() => {
      setResources((prev) => {
        if (!prev.length) return prev;
        const copy = [...prev];
        const index = Math.floor(Math.random() * copy.length);
        copy[index] = randomizeResource(copy[index]);
        return copy;
      });
      updateFromSensors();
      syncWithFirefighterMap();
      syncWithDeviceManager();
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  const selected = useMemo(() => resources.find((item) => item.id === selectedId) || null, [resources, selectedId]);

  return (
    <main className="resource-tracker">
      <section>
        <h2>Resources</h2>
        <ul>
          {resources.map((resource) => (
            <li key={resource.id}>
              <button type="button" onClick={() => setSelectedId(resource.id)}>
                <strong>{resource.id}</strong>
                <span>{resource.type}</span>
                <span className={statusClass(resource.status)}>{resource.status}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Details</h2>
        {!selected && <p>Select a resource.</p>}
        {selected && (
          <article>
            <h3>{selected.id}</h3>
            <p>{selected.type}</p>
            <p className={statusClass(selected.status)}>{selected.status}</p>
            <p>
              {selected.location.lat}, {selected.location.lng}
            </p>
            <p>{selected.lastUpdated}</p>
          </article>
        )}
      </section>
    </main>
  );
}
