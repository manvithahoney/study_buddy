export async function storageGet(key) {
  const res = await fetch(`/api/storage/${encodeURIComponent(key)}`);
  if (!res.ok) return null;
  return res.json(); // { key, value }
}

export async function storageSet(key, value) {
  const res = await fetch(`/api/storage/${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value }),
  });
  return res.json();
}
