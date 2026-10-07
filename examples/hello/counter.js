const visitsEl = document.getElementById('visits');

async function count() {
  const visits = ((await biggle.storage.get('visits')) ?? 0) + 1;
  await biggle.storage.set('visits', visits);
  visitsEl.textContent = visits;
}

document.getElementById('reset').addEventListener('click', async () => {
  await biggle.storage.remove('visits');
  visitsEl.textContent = 0;
});

count();
