  (() => {
    const $ = (sel, root = document) => root.querySelector(sel);
    const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

    // ===== 날짜 유틸 =====
    const pad2 = (n) => String(n).padStart(2, '0');
    const fmt = (d) => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
    const parseISO = (iso) => { const [y,m,dd] = iso.split('-').map(Number); return new Date(y, m-1, dd); };
    const getMonthLabel = (y, m) => new Intl.DateTimeFormat('ko-KR', { year:'numeric', month:'long' }).format(new Date(y, m, 1));
    const daysInMonth = (y, m) => new Date(y, m+1, 0).getDate();

    // ===== 상태 =====
    let viewYear, viewMonth; // 현재 표시 월
    let selectedDate;        // 'YYYY-MM-DD'

    // ===== 저장소 =====
    const STORE_KEY = 'tdm.events';
    const loadStore = () => {
      try {
        const raw = localStorage.getItem(STORE_KEY);
        if (!raw) return { events: [] };
        const obj = JSON.parse(raw);
        return { events: Array.isArray(obj.events) ? obj.events : [] };
      } catch { return { events: [] }; }
    };
    const saveStore = (store) => localStorage.setItem(STORE_KEY, JSON.stringify(store));
    const genId = () => 'e_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

    // ===== 반복 로직 =====
    function occursOnDate(ev, dateIso){
      const target = parseISO(dateIso);
      const start = parseISO(ev.date);
      const repeat = ev.repeat || 'none';

      if (repeat === 'none')  return dateIso === ev.date;
      if (target < start)     return false;
      if (repeat === 'daily') return true;
      if (repeat === 'weekly')  return target.getDay() === start.getDay();
      if (repeat === 'monthly') return target.getDate() === start.getDate();
      if (repeat === 'yearly')  return (target.getMonth() === start.getMonth()) && (target.getDate() === start.getDate());
      return false;
    }
    const eventsOnDate = (dateIso, store) => store.events.filter(ev => occursOnDate(ev, dateIso));

    // ===== 엘리먼트 =====
    const monthLabelEl = $('#cal-month-label');
    const gridEl = $('#cal-grid');
    const quickAddBar = $('#quickAddBar');
    const quickAddDate = $('#quickAddDate');

    // Modal refs
    const modalEl     = $('#createItemModal');
    const formEl      = $('#createItemForm');
    const inputDate   = $('#itemDate');
    const inputType   = $('#itemType');
    const inputTitle  = $('#itemTitle');
    const inputTime   = $('#itemTime');
    const inputAllDay = $('#itemAllDay');
    const repeatRow   = $('#repeatRow');
    const inputRepeat = $('#itemRepeat');

    let bsModal = null;

    function setMonthLabel(y, m){ monthLabelEl.textContent = getMonthLabel(y, m); }

    function setSelectedDate(iso){
      selectedDate = iso;
      quickAddBar.classList.remove('d-none');
      quickAddDate.textContent = iso;
      $$('.date-btn').forEach(b => b.classList.toggle('active', b.dataset.date === iso));
    }

    function iconFor(ev){
      return ({
        routine:'<i class="fa-solid fa-repeat"></i>',
        schedule:'<i class="fa-regular fa-calendar"></i>',
        anniversary:'<i class="fa-regular fa-star"></i>'
      }[ev.type] || '<i class="fa-regular fa-circle"></i>');
    }
    function escapeHtml(s){
      return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
    }

    function buildCell(date, { muted=false, isToday=false } = {}, store){
      const iso = fmt(date);

      const td = document.createElement('td');
      if (muted) td.classList.add('muted');
      if (isToday) td.classList.add('today');
      td.dataset.date = iso;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-sm btn-light rounded-3 px-2 py-1 date-btn w-100 text-start';
      btn.dataset.date = iso;
      btn.innerHTML = `<span class="fw-semibold">${date.getDate()}</span>`;
      btn.addEventListener('click', () => setSelectedDate(iso));
      td.appendChild(btn);

      const mini = document.createElement('div');
      mini.className = 'mini-actions';
      mini.innerHTML = `
        <button class="btn btn-outline-primary btn-sm" title="루틴" data-quick-add="routine" data-date="\${iso}">
          <i class="fa-solid fa-repeat"></i>
        </button>
        <button class="btn btn-outline-success btn-sm" title="일정" data-quick-add="schedule" data-date="\${iso}">
          <i class="fa-regular fa-calendar"></i>
        </button>
        <button class="btn btn-outline-warning btn-sm" title="기념일" data-quick-add="anniversary" data-date="\${iso}">
          <i class="fa-regular fa-star"></i>
        </button>`;
      td.appendChild(mini);

      const chipsWrap = document.createElement('div');
      chipsWrap.className = 'chips';
      const evs = eventsOnDate(iso, store);
      const maxShow = 3;
      evs.slice(0, maxShow).forEach(ev => {
        const chip = document.createElement('span');
        chip.className = 'chip';
        chip.innerHTML = `${iconFor(ev)} ${escapeHtml(ev.title)}${ev.time && !ev.allDay ? ` <span class="text-muted">${ev.time}</span>` : ''}`;
        chipsWrap.appendChild(chip);
      });
      if (evs.length > maxShow){
        const more = document.createElement('span');
        more.className = 'chip';
        more.textContent = '+' + (evs.length - maxShow);
        chipsWrap.appendChild(more);
      }
      td.appendChild(chipsWrap);

      mini.addEventListener('click', (e) => {
        const t = e.target.closest('[data-quick-add]');
        if (!t) return;
        openCreateModal({ date: iso, type: t.dataset.quickAdd });
      });

      return td;
    }

    function renderGrid(y, m){
      gridEl.innerHTML = '';
      const store = loadStore();
      setMonthLabel(y, m);

      const first = new Date(y, m, 1);
      const totalDays = daysInMonth(y, m);
      const firstWeekday = first.getDay();
      const prevMonthLast = new Date(y, m, 0);
      const todayIso = fmt(new Date());

      for (let cell=0; cell<42; cell++){
        if (cell % 7 === 0) gridEl.appendChild(document.createElement('tr'));

        let d, muted=false;
        if (cell < firstWeekday){
          d = new Date(prevMonthLast);
          d.setDate(prevMonthLast.getDate() - (firstWeekday - 1 - cell));
          muted = true;
        } else if (cell >= firstWeekday + totalDays){
          const offset = cell - (firstWeekday + totalDays) + 1;
          d = new Date(y, m, totalDays + offset);
          muted = true;
        } else {
          const day = cell - firstWeekday + 1;
          d = new Date(y, m, day);
        }

        const isToday = fmt(d) === todayIso && !muted;
        gridEl.lastElementChild.appendChild(buildCell(d, { muted, isToday }, store));
      }

      if (!selectedDate){
        setSelectedDate(fmt(new Date()));
      }else{
        $$('.date-btn').forEach(b => b.classList.toggle('active', b.dataset.date === selectedDate));
      }
    }

    // ===== 모달 =====
    function ensureModal(){
      if (!bsModal && typeof bootstrap !== 'undefined' && bootstrap.Modal){
        bsModal = new bootstrap.Modal(modalEl);
      }
      return bsModal;
    }

    function openCreateModal({ date, type } = {}){
      inputDate.value = (date || selectedDate || fmt(new Date()));
      inputType.value = (type || 'schedule');
      inputTitle.value = '';
      inputTime.value = '';
      inputAllDay.checked = false;

      if (inputType.value === 'routine'){
        repeatRow.classList.remove('d-none');
        inputRepeat.value = 'daily';
      } else if (inputType.value === 'anniversary'){
        repeatRow.classList.remove('d-none');
        inputRepeat.value = 'yearly';
      } else {
        repeatRow.classList.add('d-none');
        inputRepeat.value = 'none';
      }
      ensureModal()?.show();
    }

    inputType.addEventListener('change', () => {
      if (inputType.value === 'routine'){
        repeatRow.classList.remove('d-none');
        if (inputRepeat.value === 'none') inputRepeat.value = 'daily';
      } else if (inputType.value === 'anniversary'){
        repeatRow.classList.remove('d-none');
        inputRepeat.value = 'yearly';
      } else {
        repeatRow.classList.add('d-none');
        inputRepeat.value = 'none';
      }
    });

    inputAllDay.addEventListener('change', () => {
      inputTime.disabled = inputAllDay.checked;
      if (inputAllDay.checked) inputTime.value = '';
    });

    formEl.addEventListener('submit', (e) => {
      e.preventDefault();
      const store = loadStore();
      const ev = {
        id: genId(),
        date: inputDate.value,
        type: inputType.value,
        title: inputTitle.value.trim(),
        time: inputAllDay.checked ? null : (inputTime.value || null),
        allDay: !!inputAllDay.checked,
        repeat: inputRepeat.value,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      if (!ev.title){ inputTitle.focus(); return; }

      store.events.push(ev);
      saveStore(store);
      ensureModal()?.hide();
      renderGrid(viewYear, viewMonth);
    });

    // ===== 상단 월 전환 =====
    $('#btnPrevMonth').addEventListener('click', () => {
      const d = new Date(viewYear, viewMonth - 1, 1);
      viewYear = d.getFullYear();
      viewMonth = d.getMonth();
      renderGrid(viewYear, viewMonth);
    });
    $('#btnNextMonth').addEventListener('click', () => {
      const d = new Date(viewYear, viewMonth + 1, 1);
      viewYear = d.getFullYear();
      viewMonth = d.getMonth();
      renderGrid(viewYear, viewMonth);
    });
    $('#btnToday').addEventListener('click', () => {
      const now = new Date();
      viewYear = now.getFullYear();
      viewMonth = now.getMonth();
      renderGrid(viewYear, viewMonth);
      setSelectedDate(fmt(now));
      $('#calendar').scrollIntoView({ behavior:'smooth', block:'start' });
    });

    // 빠른 추가 바(큰 버튼) → 모달 열기
    document.addEventListener('click', (e) => {
      const openBtn = e.target.closest('[data-open-create]');
      if (!openBtn) return;
      openCreateModal({ date: selectedDate, type: openBtn.dataset.openCreate });
    });

    // 초기화
    document.addEventListener('DOMContentLoaded', () => {
      const now = new Date();
      viewYear = now.getFullYear();
      viewMonth = now.getMonth();
      renderGrid(viewYear, viewMonth);
      setSelectedDate(fmt(now));
      $('#year').textContent = now.getFullYear();
    });

    // 푸터 연도(안전망)
    $('#year').textContent = new Date().getFullYear();
  })();