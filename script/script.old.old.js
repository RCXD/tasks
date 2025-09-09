(() => {
  // ===== Helpers =====
  const $ = (sel, root = document) => root.querySelector(sel);
  const create = (tag, attrs = {}, html = '') => {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'class') el.className = v;
      else if (k === 'dataset') Object.entries(v).forEach(([dk, dv]) => (el.dataset[dk] = dv));
      else el.setAttribute(k, v);
    });
    if (html) el.innerHTML = html;
    return el;
  };
  const pad2 = (n) => String(n).padStart(2, '0');
  const fmt = (d) => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
  const parseISO = (iso) => { const [y,m,dd] = iso.split('-').map(Number); return new Date(y, m-1, dd); };

  // ===== Storage =====
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

  // ===== Repeat rules =====
  function occursOnDate(ev, dateIso){
    const target = parseISO(dateIso);
    const start = parseISO(ev.date);
    const repeat = ev.repeat || 'none';

    if (repeat === 'none') return dateIso === ev.date;
    if (target < start) return false;

    if (repeat === 'daily')   return true;
    if (repeat === 'weekly')  return target.getDay() === start.getDay();
    if (repeat === 'monthly') return target.getDate() === start.getDate();
    if (repeat === 'yearly')  return target.getMonth() === start.getMonth() && target.getDate() === start.getDate();
    return false;
  }

  function iconFor(type){
    return ({
      routine: '<i class="fa-solid fa-repeat"></i>',
      schedule: '<i class="fa-regular fa-calendar"></i>',
      anniversary: '<i class="fa-regular fa-star"></i>',
    }[type] || '<i class="fa-regular fa-circle"></i>');
  }
  const escapeHtml = (s) => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

  // ===== Calendar Component =====
  class TodoCalendar {
    constructor(root){
      if (!root) throw new Error('todo-calendar mount point not found');
      this.root = root;
      this.locale = root.dataset.locale || 'ko-KR';

      const now = new Date();
      this.viewYear = now.getFullYear();
      this.viewMonth = now.getMonth();
      this.selectedDate = fmt(now);

      this.store = loadStore();
      this.build();
      this.render();
      this.setSelected(this.selectedDate);
    }

    // --- Markup skeleton ---
    build(){
      this.root.innerHTML = '';

      // Header (title + controls)
      const header = create('div', { class:'d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3' });
      const title  = create('h2', { class:'fw-bold h4 mb-0' }, '달력');

      const controls = create('div', { class:'d-flex align-items-center gap-2' });
      this.btnPrev   = create('button', { class:'btn btn-outline-secondary', type:'button' }, '<i class="fa-solid fa-chevron-left"></i>');
      this.monthLbl  = create('div', { class:'px-3 py-2 fw-semibold', id:'cal-month-label', 'aria-live':'polite' });
      this.btnNext   = create('button', { class:'btn btn-outline-secondary', type:'button' }, '<i class="fa-solid fa-chevron-right"></i>');
      this.btnToday  = create('button', { class:'btn btn-outline-primary ms-2', type:'button' }, '오늘');
      controls.append(this.btnPrev, this.monthLbl, this.btnNext, this.btnToday);

      header.append(title, controls);

      // Table
      const card = create('div', { class:'card shadow-sm' });
      const body = create('div', { class:'card-body p-0' });
      const wrap = create('div', { class:'table-responsive' });
      this.table = create('table', { class:'table table-bordered mb-0 calendar-table' });

      const thead = create('thead', { class:'table-light text-center small' });
      thead.innerHTML = `
        <tr><th>일</th><th>월</th><th>화</th><th>수</th><th>목</th><th>금</th><th>토</th></tr>
      `;
      this.tbody = create('tbody', { id:'cal-grid', class:'align-middle' });

      this.table.append(thead, this.tbody);
      wrap.append(this.table);
      body.append(wrap);
      card.append(body);

      // Quick Add Bar
      this.quickBar = create('div', { id:'quickAddBar', class:'d-none position-sticky bottom-0 mt-3' });
      const qInner = create('div', { class:'p-3 bg-white border rounded-4 shadow-sm d-flex flex-wrap align-items-center justify-content-between gap-2' });
      const qLeft  = create('div', { class:'d-flex align-items-center gap-2' }, `<i class="fa-regular fa-calendar text-primary"></i> <strong id="quickAddDate">YYYY-MM-DD</strong>`);
      const qRight = create('div', { class:'d-flex gap-2' });
      this.btnAddRoutine     = create('button', { class:'btn btn-outline-primary', type:'button', 'data-open-create':'routine' }, '<i class="fa-solid fa-repeat me-2"></i>루틴 추가');
      this.btnAddSchedule    = create('button', { class:'btn btn-outline-success', type:'button', 'data-open-create':'schedule' }, '<i class="fa-regular fa-calendar me-2"></i>일정 추가');
      this.btnAddAnniversary = create('button', { class:'btn btn-outline-warning', type:'button', 'data-open-create':'anniversary' }, '<i class="fa-regular fa-star me-2"></i>기념일 추가');
      qRight.append(this.btnAddRoutine, this.btnAddSchedule, this.btnAddAnniversary);
      qInner.append(qLeft, qRight);
      this.quickBar.append(qInner);

      // Modal (created once)
      this.modalId = `createItemModal_${Math.random().toString(36).slice(2,8)}`;
      this.modalEl = create('div', { class:'modal fade', id:this.modalId, tabindex:'-1', 'aria-labelledby':`${this.modalId}_label`, 'aria-hidden':'true' });
      this.modalEl.innerHTML = `
        <div class="modal-dialog">
          <form class="modal-content" id="${this.modalId}_form">
            <div class="modal-header">
              <h5 class="modal-title" id="${this.modalId}_label">새 항목 추가</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="닫기"></button>
            </div>
            <div class="modal-body">
              <div class="mb-3">
                <label class="form-label">날짜</label>
                <input type="date" class="form-control" id="${this.modalId}_date" required />
              </div>
              <div class="mb-3">
                <label class="form-label">종류</label>
                <select class="form-select" id="${this.modalId}_type" required>
                  <option value="routine">루틴</option>
                  <option value="schedule">일정</option>
                  <option value="anniversary">기념일</option>
                </select>
              </div>
              <div class="mb-3">
                <label class="form-label">제목</label>
                <input type="text" class="form-control" id="${this.modalId}_title" placeholder="예: 아침 스트레칭 / 팀 미팅 / 결혼기념일" required />
              </div>
              <div class="row g-2 align-items-end">
                <div class="col-6">
                  <label class="form-label">시간</label>
                  <input type="time" class="form-control" id="${this.modalId}_time" />
                </div>
                <div class="col-6">
                  <div class="form-check mt-4">
                    <input class="form-check-input" type="checkbox" id="${this.modalId}_allday" />
                    <label class="form-check-label" for="${this.modalId}_allday">하루 종일</label>
                  </div>
                </div>
              </div>
              <div class="mt-3 d-none" id="${this.modalId}_repeatRow">
                <label class="form-label">반복</label>
                <select class="form-select" id="${this.modalId}_repeat">
                  <option value="none">반복 없음</option>
                  <option value="daily">매일</option>
                  <option value="weekly">매주</option>
                  <option value="monthly">매월</option>
                  <option value="yearly">매년</option>
                </select>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-secondary" type="button" data-bs-dismiss="modal">취소</button>
              <button class="btn btn-primary" type="submit"><i class="fa-regular fa-floppy-disk me-2"></i>저장</button>
            </div>
          </form>
        </div>
      `;

      // Append all
      this.root.append(header, card, this.quickBar);
      document.body.appendChild(this.modalEl);

      // Refs
      this.quickAddDate = $('#quickAddDate', this.quickBar);
      this.formEl    = $(`#${this.modalId}_form`);
      this.inputDate = $(`#${this.modalId}_date`);
      this.inputType = $(`#${this.modalId}_type`);
      this.inputTitle= $(`#${this.modalId}_title`);
      this.inputTime = $(`#${this.modalId}_time`);
      this.inputAllDay = $(`#${this.modalId}_allday`);
      this.repeatRow = $(`#${this.modalId}_repeatRow`);
      this.inputRepeat = $(`#${this.modalId}_repeat`);

      // Bootstrap modal instance (if available)
      this.bsModal = (typeof bootstrap !== 'undefined' && bootstrap.Modal)
        ? new bootstrap.Modal(this.modalEl)
        : null;

      // Events
      this.btnPrev.addEventListener('click', () => this.shiftMonth(-1));
      this.btnNext.addEventListener('click', () => this.shiftMonth(1));
      this.btnToday.addEventListener('click', () => this.goToday());

      this.btnAddRoutine.addEventListener('click', () => this.openCreate({ type:'routine' }));
      this.btnAddSchedule.addEventListener('click', () => this.openCreate({ type:'schedule' }));
      this.btnAddAnniversary.addEventListener('click', () => this.openCreate({ type:'anniversary' }));

      this.inputType.addEventListener('change', () => this.toggleRepeatUI());
      this.inputAllDay.addEventListener('change', () => {
        this.inputTime.disabled = this.inputAllDay.checked;
        if (this.inputAllDay.checked) this.inputTime.value = '';
      });
      this.formEl.addEventListener('submit', (e) => this.saveItem(e));
    }

    // --- Month ops ---
    shiftMonth(delta){
      const d = new Date(this.viewYear, this.viewMonth + delta, 1);
      this.viewYear = d.getFullYear();
      this.viewMonth = d.getMonth();
      this.render();
    }
    goToday(){
      const now = new Date();
      this.viewYear = now.getFullYear();
      this.viewMonth = now.getMonth();
      this.render();
      this.setSelected(fmt(now));
      this.root.scrollIntoView({ behavior:'smooth', block:'start' });
    }

    // --- Render grid ---
    render(){
      // Month label
      this.monthLbl.textContent = new Intl.DateTimeFormat(this.locale, { year:'numeric', month:'long' })
        .format(new Date(this.viewYear, this.viewMonth, 1));

      // Build 6x7
      this.tbody.innerHTML = '';
      const first = new Date(this.viewYear, this.viewMonth, 1);
      const firstWeekday = first.getDay(); // Sun=0
      const totalDays = new Date(this.viewYear, this.viewMonth+1, 0).getDate();
      const prevMonthLast = new Date(this.viewYear, this.viewMonth, 0); // 이전 달 마지막일

      const todayIso = fmt(new Date());

      for (let cell=0; cell<42; cell++){
        if (cell % 7 === 0) this.tbody.appendChild(create('tr'));

        let d, muted=false;
        if (cell < firstWeekday){
          d = new Date(prevMonthLast);
          d.setDate(prevMonthLast.getDate() - (firstWeekday - 1 - cell));
          muted = true;
        } else if (cell >= firstWeekday + totalDays){
          const offset = cell - (firstWeekday + totalDays) + 1;
          d = new Date(this.viewYear, this.viewMonth, totalDays + offset);
          muted = true;
        } else {
          const day = cell - firstWeekday + 1;
          d = new Date(this.viewYear, this.viewMonth, day);
        }

        const iso = fmt(d);
        const td = create('td', { class: muted ? 'muted' : '' });
        if (!muted && iso === todayIso) td.classList.add('today');
        td.dataset.date = iso;

        const dateBtn = create('button', { type:'button', class:'btn btn-sm btn-light rounded-3 px-2 py-1 date-btn w-100 text-start' });
        dateBtn.dataset.date = iso;
        dateBtn.innerHTML = `<span class="fw-semibold">${d.getDate()}</span>`;
        dateBtn.addEventListener('click', () => this.setSelected(iso));
        td.appendChild(dateBtn);

        // mini actions
        const actions = create('div', { class:'mini-actions d-flex gap-1 mt-1' });
        actions.innerHTML = `
          <button class="btn btn-outline-primary btn-sm" title="루틴" data-quick-add="routine" data-date="${iso}">
            <i class="fa-solid fa-repeat"></i>
          </button>
          <button class="btn btn-outline-success btn-sm" title="일정" data-quick-add="schedule" data-date="${iso}">
            <i class="fa-regular fa-calendar"></i>
          </button>
          <button class="btn btn-outline-warning btn-sm" title="기념일" data-quick-add="anniversary" data-date="${iso}">
            <i class="fa-regular fa-star"></i>
          </button>
        `;
        actions.addEventListener('click', (e) => {
          const t = e.target.closest('[data-quick-add]');
          if (!t) return;
          this.openCreate({ date: iso, type: t.dataset.quickAdd });
        });
        td.appendChild(actions);

        // chips
        const chips = create('div', { class:'chips d-flex flex-wrap gap-1 mt-1' });
        const evs = this.store.events.filter(ev => occursOnDate(ev, iso));
        evs.slice(0,3).forEach(ev => {
          const chip = create('span', { class:'chip border rounded-2 px-2 py-1 bg-white' },
            `${iconFor(ev.type)} ${escapeHtml(ev.title)}${ev.time && !ev.allDay ? ` <span class="text-muted">${ev.time}</span>` : ''}`
          );
          chips.appendChild(chip);
        });
        if (evs.length > 3){
          chips.appendChild(create('span', { class:'chip border rounded-2 px-2 py-1 bg-white' }, `+${evs.length-3}`));
        }
        td.appendChild(chips);

        this.tbody.lastElementChild.appendChild(td);
      }

      // active state sync
      this.syncActiveButtons();
    }

    setSelected(iso){
      this.selectedDate = iso;
      this.quickBar.classList.remove('d-none');
      this.quickAddDate.textContent = iso;
      this.syncActiveButtons();
    }

    syncActiveButtons(){
      this.root.querySelectorAll('.date-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.date === this.selectedDate);
      });
    }

    // --- Modal open/save ---
    openCreate({ date, type } = {}){
      this.inputDate.value = date || this.selectedDate || fmt(new Date());
      this.inputType.value = type || 'schedule';
      this.inputTitle.value = '';
      this.inputTime.value = '';
      this.inputAllDay.checked = false;

      // repeat UI
      if (this.inputType.value === 'routine'){
        this.repeatRow.classList.remove('d-none');
        this.inputRepeat.value = 'daily';
      } else if (this.inputType.value === 'anniversary'){
        this.repeatRow.classList.remove('d-none');
        this.inputRepeat.value = 'yearly';
      } else {
        this.repeatRow.classList.add('d-none');
        this.inputRepeat.value = 'none';
      }

      if (this.bsModal) this.bsModal.show();
      else this.modalEl.classList.add('show'); // Fallback (간단 표기)
    }

    toggleRepeatUI(){
      if (this.inputType.value === 'routine'){
        this.repeatRow.classList.remove('d-none');
        if (this.inputRepeat.value === 'none') this.inputRepeat.value = 'daily';
      } else if (this.inputType.value === 'anniversary'){
        this.repeatRow.classList.remove('d-none');
        this.inputRepeat.value = 'yearly';
      } else {
        this.repeatRow.classList.add('d-none');
        this.inputRepeat.value = 'none';
      }
    }

    saveItem(e){
      e.preventDefault();
      const ev = {
        id: genId(),
        date: this.inputDate.value,
        type: this.inputType.value,
        title: this.inputTitle.value.trim(),
        time: this.inputAllDay.checked ? null : (this.inputTime.value || null),
        allDay: !!this.inputAllDay.checked,
        repeat: this.inputRepeat.value,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      if (!ev.title) { this.inputTitle.focus(); return; }

      this.store.events.push(ev);
      saveStore(this.store);

      if (this.bsModal) this.bsModal.hide();
      else this.modalEl.classList.remove('show');

      this.render();
    }
  }

  // ===== Mount on DOM ready =====
  document.addEventListener('DOMContentLoaded', () => {
    const mount = document.getElementById('todo-calendar');
    if (mount) new TodoCalendar(mount);
  });
})();
