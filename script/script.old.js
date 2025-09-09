(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // ====== 날짜 유틸 ======
  const pad2 = (n) => String(n).padStart(2, '0');
  const fmt = (d) => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
  const parseISO = (iso) => {
    const [y,m,dd] = iso.split('-').map(Number);
    return new Date(y, m-1, dd);
  };
  const getMonthLabel = (y, m) =>
    new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long' }).format(new Date(y, m, 1));

  const daysInMonth = (y, m /* 0-11 */) => new Date(y, m+1, 0).getDate();
  const startOfMonth = (y, m) => new Date(y, m, 1);
  const endOfMonth = (y, m) => new Date(y, m+1, 0);

  // ====== 상태 ======
  let viewYear, viewMonth; // 현재 보고 있는 월(연/월)
  let selectedDate;        // 'YYYY-MM-DD' 문자열

  // ====== 저장소 ======
  const STORE_KEY = 'tdm.events';
  const loadStore = () => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return { events: [] };
      const obj = JSON.parse(raw);
      return { events: Array.isArray(obj.events) ? obj.events : [] };
    } catch {
      return { events: [] };
    }
  };
  const saveStore = (store) => localStorage.setItem(STORE_KEY, JSON.stringify(store));
  const genId = () => 'e_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

  // ====== 반복 로직 ======
  function occursOnDate(ev, dateIso){
    // ev: {date, type, repeat, ...}
    // dateIso: 'YYYY-MM-DD'
    const target = parseISO(dateIso);
    const start = parseISO(ev.date);

    // 과거-미래 모두 표시(루틴 가정). 필요 시 시작일 이후만 표시로 제한하려면 if(target<start) return false;
    const repeat = ev.repeat || 'none';

    if (repeat === 'none') {
      return dateIso === ev.date;
    }

    if (repeat === 'daily') {
      return target >= start; // 시작일 이후 매일
    }

    if (repeat === 'weekly') {
      // 같은 요일 && 시작일 이후 주
      return target.getDay() === start.getDay() && target >= start;
    }

    if (repeat === 'monthly') {
      // 매월 '일자' 동일 (예외: 31일→ 짧은 달 처리)
      if (target < start) return false;
      return target.getDate() === start.getDate();
    }

    if (repeat === 'yearly') {
      // 매년 월/일 동일
      if (target < start) return false;
      return (target.getMonth() === start.getMonth()) && (target.getDate() === start.getDate());
    }

    return false;
  }

  const eventsOnDate = (dateIso, store) =>
    store.events.filter(ev => occursOnDate(ev, dateIso));

  // ====== 렌더링 ======
  const monthLabelEl = $('#cal-month-label');
  const gridEl = $('#cal-grid');
  const quickAddBar = $('#quickAddBar');
  const quickAddDate = $('#quickAddDate');

  function setMonthLabel(y, m){
    monthLabelEl.textContent = `${getMonthLabel(y, m)}`
  }

  function setSelectedDate(iso){
    selectedDate = iso;
    quickAddBar.classList.remove('d-none');
    quickAddDate.textContent = iso;

    // 버튼 active 상태 갱신
    $$('.date-btn').forEach(b => b.classList.toggle('active', b.dataset.date === iso));
  }

  function buildCell(date, { muted=false, isToday=false } = {}, store){
    const iso = fmt(date);

    // TD
    const td = document.createElement('td');
    if (muted) td.classList.add('muted');
    if (isToday) td.classList.add('today');
    td.dataset.date = iso;

    // Date button
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-sm btn-light rounded-3 px-2 py-1 date-btn w-100 text-start';
    btn.dataset.date = iso;
    btn.innerHTML = `<span class="fw-semibold">${date.getDate()}</span>`;
    btn.addEventListener('click', () => setSelectedDate(iso));
    td.appendChild(btn);

    // Quick add mini buttons
    const mini = document.createElement('div');
    mini.className = 'mini-actions';
    mini.innerHTML = `
      <button class="btn btn-outline-primary btn-sm" title="루틴" data-quick-add="routine" data-date="${iso}">
        <i class="fa-solid fa-repeat"></i>
      </button>
      <button class="btn btn-outline-success btn-sm" title="일정" data-quick-add="schedule" data-date="${iso}">
        <i class="fa-regular fa-calendar"></i>
      </button>
      <button class="btn btn-outline-warning btn-sm" title="기념일" data-quick-add="anniversary" data-date="${iso}">
        <i class="fa-regular fa-star"></i>
      </button>`;
    td.appendChild(mini);

    // Chips (events summary)
    const chipsWrap = document.createElement('div');
    chipsWrap.className = 'chips';
    const evs = eventsOnDate(iso, loadStore());
    const maxShow = 3;
    evs.slice(0, maxShow).forEach(ev => {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.innerHTML = `${iconFor(ev)} ${escapeHtml(ev.title)}${ev.time && !ev.allDay ? ` <span class="text-muted">${ev.time}</span>` : ''}`;
      chipsWrap.appendChild(chip);
    });
    if (evs.length > maxShow) {
      const more = document.createElement('span');
      more.className = 'chip';
      more.textContent = `+${evs.length - maxShow}`;
      chipsWrap.appendChild(more);
    }
    td.appendChild(chipsWrap);

    // Delegate quick-add
    mini.addEventListener('click', (e) => {
      const t = e.target.closest('[data-quick-add]');
      if (!t) return;
      openCreateModal({
        date: t.dataset.date,
        type: t.dataset.quickAdd
      });
    });

    return td;
  }

  function renderGrid(y, m){
    // m: 0-11
    gridEl.innerHTML = '';
    const store = loadStore();
    setMonthLabel(y, m);

    const first = startOfMonth(y, m);
    const last = endOfMonth(y, m);

    const firstWeekday = first.getDay(); // Sun=0
    const totalDays = daysInMonth(y, m);

    // 앞쪽 채우기(이전달)
    const prevMonthLast = endOfMonth(y, m-1);
    const leadCount = firstWeekday; // 0이면 없음
    const rows = [];
    let row;

    const todayIso = fmt(new Date());

    // 6행 × 7열
    for (let cell = 0; cell < 42; cell++){
      if (cell % 7 === 0){
        row = document.createElement('tr');
        rows.push(row);
      }

      let d, muted=false;

      if (cell < leadCount) {
        // 이전 달
        d = new Date(prevMonthLast);
        d.setDate(prevMonthLast.getDate() - (leadCount - 1 - cell));
        muted = true;
      } else if (cell >= leadCount + totalDays) {
        // 다음 달
        const offset = cell - (leadCount + totalDays) + 1;
        d = new Date(y, m, totalDays + offset);
        muted = true;
      } else {
        // 이번 달
        const day = cell - leadCount + 1;
        d = new Date(y, m, day);
      }

      const isToday = fmt(d) === todayIso && !muted;

      row.appendChild(buildCell(d, { muted, isToday }, store));
    }

    rows.forEach(r => gridEl.appendChild(r));

    // 선택 날짜 유지 or 오늘로
    if (!selectedDate){
      setSelectedDate(todayIso);
    }else{
      // 기존 선택이 현재 그리드 범위 밖이어도 quickBar는 유지
      $$('.date-btn').forEach(b => b.classList.toggle('active', b.dataset.date === selectedDate));
    }
  }

  function iconFor(ev){
    const base = {
      routine: '<i class="fa-solid fa-repeat"></i>',
      schedule: '<i class="fa-regular fa-calendar"></i>',
      anniversary: '<i class="fa-regular fa-star"></i>'
    }[ev.type] || '<i class="fa-regular fa-circle"></i>';
    return base;
  }

  function escapeHtml(s){
    return s.replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
    }[c]));
  }

  // ====== 모달 로직 ======
  const modalEl = $('#createItemModal');
  const formEl = $('#createItemForm');
  const inputDate = $('#itemDate');
  const inputType = $('#itemType');
  const inputTitle = $('#itemTitle');
  const inputTime = $('#itemTime');
  const inputAllDay = $('#itemAllDay');
  const repeatRow = $('#repeatRow');
  const inputRepeat = $('#itemRepeat');

  let bsModal;
  function ensureModal(){
    if (!bsModal){
      // bootstrap가 전역으로 로드되어 있음
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

    // 반복 UI: 루틴일 때 표시, 기념일은 기본 yearly 권장
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

    ensureModal().show();
  }

  // 빠른 추가 바의 큰 버튼
  document.addEventListener('click', (e) => {
    const openBtn = e.target.closest('[data-open-create]');
    if (!openBtn) return;
    openCreateModal({ date: selectedDate, type: openBtn.dataset.openCreate });
  });

  // 타입 변경 시 반복 UI 토글
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

  // 하루 종일 체크 → 시간 비활성화
  inputAllDay.addEventListener('change', () => {
    inputTime.disabled = inputAllDay.checked;
    if (inputAllDay.checked) inputTime.value = '';
  });

  // 저장
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

    if (!ev.title){
      inputTitle.focus();
      return;
    }

    store.events.push(ev);
    saveStore(store);

    ensureModal().hide();

    // 현재 보이는 달 다시 렌더
    renderGrid(viewYear, viewMonth);
  });

  // ====== 내비(월 전환) ======
  $('[data-cal-action="prev-month"]').addEventListener('click', () => {
    const d = new Date(viewYear, viewMonth - 1, 1);
    viewYear = d.getFullYear();
    viewMonth = d.getMonth();
    renderGrid(viewYear, viewMonth);
  });

  $('[data-cal-action="next-month"]').addEventListener('click', () => {
    const d = new Date(viewYear, viewMonth + 1, 1);
    viewYear = d.getFullYear();
    viewMonth = d.getMonth();
    renderGrid(viewYear, viewMonth);
  });

  $('[data-cal-action="today"]').addEventListener('click', () => {
    const now = new Date();
    viewYear = now.getFullYear();
    viewMonth = now.getMonth();
    renderGrid(viewYear, viewMonth);
    setSelectedDate(fmt(now));
    // 화면 스크롤을 달력으로
    $('#calendar').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // ====== 초기화 ======
  document.addEventListener('DOMContentLoaded', () => {
    const now = new Date();
    viewYear = now.getFullYear();
    viewMonth = now.getMonth();
    renderGrid(viewYear, viewMonth);
    setSelectedDate(fmt(now));
  });
})();
