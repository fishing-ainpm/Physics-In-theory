// Search box and category chips on the home page.
(function () {
  const search = document.getElementById('search');
  const chips = document.querySelectorAll('.chip');
  const cards = document.querySelectorAll('#sim-list .card');
  const empty = document.getElementById('empty');
  let category = 'all';

  function apply() {
    const q = search.value.trim().toLowerCase();
    let shown = 0;
    cards.forEach((card) => {
      const ok = (category === 'all' || card.dataset.category === category) &&
        (!q || card.dataset.search.includes(q));
      card.hidden = !ok;
      if (ok) shown++;
    });
    empty.hidden = shown > 0;
  }

  chips.forEach((chip) => chip.addEventListener('click', () => {
    chips.forEach((c) => c.classList.toggle('is-active', c === chip));
    category = chip.dataset.category;
    apply();
  }));
  search.addEventListener('input', apply);
})();
