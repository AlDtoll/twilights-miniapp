(() => {
  "use strict";

  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function fmtAmt(n) {
    const v = Number(n) || 0;
    return v.toLocaleString("ru-RU");
  }

  function row(label, value, cls) {
    return `<div class="ev-row"><span>${esc(label)}</span><span class="ev-row-amt${cls ? ` ${cls}` : ""}">${esc(value)}</span></div>`;
  }

  function amtRows(items, sign) {
    let html = "";
    for (const it of items || []) {
      const amt = fmtAmt(it.amount);
      html += row(it.label, sign ? `${sign}${amt}` : amt);
    }
    return html;
  }

  function section(title, inner) {
    if (!inner) return "";
    return `<section class="ev-sec"><h3 class="ev-sec-title">${esc(title)}</h3>${inner}</section>`;
  }

  function growthLines(items) {
    let html = "";
    for (const it of items || []) {
      const pct = Number(it.pct) || 0;
      const sign = pct > 0 ? "+" : "";
      html += row(it.name || "фактор", `${sign}${pct}%`);
    }
    return html;
  }

  function listItems(items) {
    if (!items || !items.length) return "";
    return items.map((t) => `<div class="ev-roll-item">— ${esc(t)}</div>`).join("");
  }

  function loyaltyBar(loy) {
    if (!loy || !loy.total) return "";
    const l = Math.min(10, Math.round((loy.l_pct || 0) / 10));
    const n = Math.min(10, Math.round((loy.n_pct || 0) / 10));
    const nl = Math.min(10, Math.round((loy.nl_pct || 0) / 10));
    let html = `<div class="loy-bar" aria-hidden="true">`;
    html += `<span class="loy-l" style="flex:${l || 0.001}"></span>`;
    html += `<span class="loy-n" style="flex:${n || 0.001}"></span>`;
    html += `<span class="loy-nl" style="flex:${nl || 0.001}"></span>`;
    html += `</div>`;
    html += `<div class="ev-roll-item">Л ${loy.l_pct}% · Н ${loy.n_pct}% · НЛ ${loy.nl_pct}% (${loy.l}/${loy.n}/${loy.nl})</div>`;
    return html;
  }

  function effLine(eff) {
    if (!eff) return "";
    let s = `${eff.total}%`;
    if (eff.penalty || eff.bonus) {
      s += ` (${eff.base}%`;
      if (eff.penalty) s += ` − ${eff.penalty}%`;
      if (eff.bonus) s += ` + ${eff.bonus}%`;
      s += ")";
    }
    return s;
  }

  const renderers = {
    economy(data) {
      if (!data || !data.ok) return `<p class="ev-err">Не удалось загрузить экономику</p>`;
      if (!data.has_finance_file) return `<p class="ev-empty">Нет finance.md для этого seat.</p>`;
      let html = section("Казна на начало", row("Начало", fmtAmt(data.start)));
      if ((data.income_by || []).length) {
        let inner = "";
        for (const g of data.income_by) {
          if (g.name) inner += `<div class="ev-roll-title">${esc(g.name)}${g.efficiency ? ` · эфф. ${esc(effLine(g.efficiency))}` : ""}</div>`;
          inner += amtRows(g.items, "+");
        }
        html += section(`Доходы: +${fmtAmt(data.total_income)}`, inner);
      }
      if ((data.expenses_by || []).length) {
        let inner = "";
        for (const g of data.expenses_by) {
          if (g.name) inner += `<div class="ev-roll-title">${esc(g.name)}</div>`;
          inner += amtRows(g.items, "−");
        }
        html += section(`Расходы: −${fmtAmt(data.total_expenses)}`, inner);
      }
      html += section(`Прибыль: ${data.profit >= 0 ? "+" : ""}${fmtAmt(data.profit)}`, "");
      if ((data.receipts || []).length) html += section(`Поступления: +${fmtAmt(data.receipts.reduce((a, i) => a + i.amount, 0))}`, amtRows(data.receipts, "+"));
      if ((data.spendings || []).length) html += section(`Траты: −${fmtAmt(data.spendings.reduce((a, i) => a + i.amount, 0))}`, amtRows(data.spendings, "−"));
      html += section(`Казна на конец: ~${fmtAmt(data.balance)}`, "");
      if ((data.buildings || []).length) {
        let inner = "";
        for (const b of data.buildings) {
          const maint = b.maint ? `${fmtAmt(b.maint)}/сезон` : "доходная";
          inner += `<div class="ev-roll-item">${esc(b.name)}${b.status ? ` · ${esc(b.status)}` : ""} — ${fmtAmt(b.cost)} мон, содержание: ${esc(maint)}</div>`;
        }
        html += section("Постройки", inner);
      }
      if ((data.wip || []).length) html += section("Строится", amtRows(data.wip));
      const sl = data.slots || {};
      if (sl.base != null || sl.used != null) {
        const total = (Number(sl.base) || 0) + (Number(sl.extra) || 0);
        html += section(
          "Слоты строительства",
          row("Базовых", sl.base) +
            row("Доп. куплено", sl.extra) +
            row("Всего", total) +
            row("Использовано", sl.used) +
            row("Свободно", sl.free) +
            row("Докупить ещё", Math.max(0, (Number(sl.max_extra) || 0) - (Number(sl.extra) || 0)))
        );
      }
      if ((data.staff || []).length) {
        let inner = "";
        for (const s of data.staff) {
          const norm = s.norm != null ? s.norm : "—";
          inner += `<div class="ev-roll-item">${esc(s.category)} (${esc(s.np || "")}): ${esc(s.fact)} / ${esc(norm)} ${esc(s.status || "")}</div>`;
        }
        html += section("Персонал", inner);
      }
      return html || `<p class="ev-empty">Пустая экономика.</p>`;
    },

    bag(data) {
      if (!data || !data.ok) return `<p class="ev-err">Не удалось загрузить вещи</p>`;
      if (!data.has_hero_file) return `<p class="ev-empty">Нет hero_status.md для этого seat.</p>`;
      let html = "";
      const slots = data.retinue_slots;
      const occ = data.retinue_occupied || [];
      const free = data.retinue_free || [];
      if (occ.length || free.length || slots) {
        let inner = "";
        if (slots) inner += `<div class="ev-roll-item">Слотов: ${esc(slots.total)} (занято: ${esc(slots.used)})</div>`;
        inner += listItems(occ);
        for (const m of free) inner += `<div class="ev-roll-item muted-slot">${esc(m)}</div>`;
        html += section("Свита", inner);
      }
      if ((data.items || []).length) html += section("Предметы", listItems(data.items));
      if ((data.consumables || []).length) html += section("Расходники", listItems(data.consumables));
      return html || `<p class="ev-empty">Ничего нет.</p>`;
    },

    loyalty(data) {
      if (!data || !data.ok) return `<p class="ev-err">Не удалось загрузить лояльность</p>`;
      if (!data.has_settlements_file) return `<p class="ev-empty">Нет settlements.md.</p>`;
      if (!(data.settlements || []).length) return `<p class="ev-empty">Нет данных по НП.</p>`;
      let html = "";
      for (const s of data.settlements) {
        const typ = s.loyalty && s.loyalty.type ? ` (${s.loyalty.type})` : "";
        let inner = loyaltyBar(s.loyalty);
        inner += `<div class="ev-roll-item">Эфф.: ${esc(effLine(s.efficiency))}</div>`;
        if (s.loyalty && s.loyalty.mod_sum) inner += `<div class="ev-roll-item">Мод к броску: ${s.loyalty.mod_sum > 0 ? "+" : ""}${esc(s.loyalty.mod_sum)}</div>`;
        if (s.loyalty && s.loyalty.riot_risk != null) inner += `<div class="ev-warn">⚠ Риск бунта: ${esc(s.loyalty.riot_risk)}%</div>`;
        else if (s.loyalty && s.loyalty.warn) inner += `<div class="ev-warn">⚠ Нелояльность высокая</div>`;
        html += section(`${s.name}${typ}`, inner);
      }
      return html;
    },

    religion(data) {
      if (!data || !data.ok) return `<p class="ev-err">Не удалось загрузить веру</p>`;
      if (!(data.settlements || []).length) return `<p class="ev-empty">Вера по НП пока не расписана.</p>`;
      let html = "";
      for (const s of data.settlements) {
        let inner = "";
        for (const c of s.cults || []) inner += row(`${c.name}`, `${c.count} дв. (${c.pct}%)`);
        if (s.neutral) inner += row("нейтральные", `${s.neutral} дв. (${s.neutral_pct}%)`);
        const mod = s.loyalty_mod ? (s.loyalty_mod > 0 ? `+${s.loyalty_mod}` : String(s.loyalty_mod)) : "0";
        inner += `<div class="ev-roll-item">Мод. лояльности: ${esc(mod)}${s.loyalty_mod_reasons && s.loyalty_mod_reasons.length ? ` (${esc(s.loyalty_mod_reasons.join("; "))})` : ""}</div>`;
        html += section(s.name, inner);
      }
      return html;
    },

    growth(data) {
      if (!data || !data.ok) return `<p class="ev-err">Не удалось загрузить рост</p>`;
      if (!(data.settlements || []).length) return `<p class="ev-empty">Нет данных по НП.</p>`;
      let html = `<p class="ev-rolls-note">Ориентир роста на год: база + факторы + лечебные бонусы</p>`;
      for (const s of data.settlements) {
        const total = s.total != null ? s.total : 0;
        const sign = total > 0 ? "+" : "";
        let inner = row("Ориентир", `${sign}${total}%`);
        if (s.population) inner += row("Население", s.population);
        inner += growthLines(s.items);
        html += section(s.name, inner);
      }
      return html;
    },

    threat(data) {
      if (!data || !data.ok) return `<p class="ev-err">Не удалось загрузить угрозу</p>`;
      if (!data.available) return `<p class="ev-empty">Уровень угрозы недоступен для этого seat.</p>`;
      const f = data.factors || {};
      let html = `<p class="ev-rolls-note"><strong>${esc(data.total)}%</strong> — шанс нападения в этом сезоне</p>`;
      let inner = row("База", `+${f.base}%`);
      inner += row("Периметр", `+${f.perimeter}% (${f.perimeter} соседних клеток)`);
      for (const nb of f.neighbors || []) inner += `<div class="ev-roll-item indent">· ${esc(nb)}</div>`;
      inner += row("Разорённых НП", `+${f.razed}%`);
      inner += row("Опасных мест", `+${(f.danger || 0) * 2}% (${f.danger} × 2%)`);
      inner += row("Год", `+${f.year}%`);
      if (f.hero_exit) inner += row("Выход героя", "+5%");
      html += section("Факторы", inner);
      if ((data.manual_mods || []).length) {
        let mods = "";
        for (const mm of data.manual_mods) {
          const turns = mm.turns != null ? ` (×${mm.turns})` : "";
          mods += `<div class="ev-roll-item">${mm.val > 0 ? "+" : ""}${esc(mm.val)}% ${esc(mm.reason || "")}${esc(turns)}</div>`;
        }
        html += section("Ручные моды", mods);
      }
      return html;
    },

    territory(data) {
      if (!data || !data.ok) return `<p class="ev-err">Не удалось загрузить территорию</p>`;
      if (!(data.settlements || []).length) return `<p class="ev-empty">Нет данных по НП.</p>`;
      let html = "";
      for (const s of data.settlements) {
        let inner = "";
        if (s.population) inner += row("Население", s.population);
        if (s.houses) inner += row("Домов", s.houses);
        if (s.growth) inner += row("Ориентир роста", s.growth);
        const items = (s.growth_breakdown && s.growth_breakdown.items) || s.items || [];
        if (items.length) inner += growthLines(items);
        for (const st of s.staff || []) {
          const norm = st.norm != null ? st.norm : "—";
          inner += `<div class="ev-roll-item">${esc(st.category)}: ${esc(st.fact)} / ${esc(norm)} ${esc(st.status || "")}</div>`;
        }
        html += section(s.name, inner);
      }
      return html;
    },

    stash(data) {
      if (!data || !data.ok) return `<p class="ev-err">Не удалось загрузить кладовую</p>`;
      if (!(data.settlements || []).length) return `<p class="ev-empty">Кладовая пуста.</p>`;
      let html = "";
      for (const s of data.settlements) html += section(s.name, listItems(s.items));
      return html;
    },

    loot(data) {
      if (!data || !data.ok) return `<p class="ev-err">Не удалось загрузить сбыт</p>`;
      if (!data.available) return `<p class="ev-empty">Сбыт трофеев пока не ведётся.</p>`;
      let inner = row("Продано номинала", fmtAmt(data.sold));
      if (data.revenue) inner += row("Выручка", fmtAmt(data.revenue));
      if (data.eff_pct != null) inner += row("Эфф. цена", `${data.eff_pct}%`);
      if (data.band) inner += row("Полоса", fmtAmt(data.band));
      if (data.cur_rate != null) inner += row("Текущая ставка", `${data.cur_rate}%`);
      if (data.left_in_band != null) inner += row("До перехода", fmtAmt(data.left_in_band));
      return section("Сбыт трофеев за сезон", inner);
    },

    settlements(data, { openSettlement } = {}) {
      if (!data || !data.ok) return `<p class="ev-err">Не удалось загрузить список НП</p>`;
      const names = data.names || [];
      if (!names.length) return `<p class="ev-empty">Нет населённых пунктов.</p>`;
      let html = `<p class="ev-rolls-note">Выберите НП для подробностей</p><div class="np-list">`;
      for (const n of names) {
        html += `<button type="button" class="np-pick" data-np="${esc(n)}">${esc(n)}</button>`;
      }
      html += `</div>`;
      return { html, bind(root) {
        if (!root || !openSettlement) return;
        root.querySelectorAll(".np-pick").forEach((btn) => {
          btn.addEventListener("click", () => openSettlement(btn.getAttribute("data-np")));
        });
      }};
    },

    settlement(data) {
      if (!data || !data.ok) {
        if (data && data.error === "not_found") {
          const names = (data.names || []).join(", ");
          return `<p class="ev-err">НП не найден.${names ? ` Доступны: ${esc(names)}` : ""}</p>`;
        }
        return `<p class="ev-err">Не удалось загрузить НП</p>`;
      }
      const s = data.settlement || {};
      let html = "";
      if (s.population) html += row("Население", s.population);
      if (s.growth) html += row("Ориентир роста", s.growth);
      const gItems = (s.growth_breakdown && s.growth_breakdown.items) || [];
      if (gItems.length) html += section("Факторы роста", growthLines(gItems));
      if (s.houses) html += row("Домов", s.houses);
      if (s.loyalty && s.loyalty.type) html += row("Тип", s.loyalty.type);
      if (s.loyalty && s.loyalty.total) {
        html += section("Лояльность", loyaltyBar(s.loyalty) + `<div class="ev-roll-item">Эфф.: ${esc(effLine(s.efficiency))}</div>`);
      }
      if ((s.income || []).length) html += section("Доходы", amtRows(s.income, "+"));
      if ((s.expenses_np || []).length) html += section("Расходы НП", amtRows(s.expenses_np, "−"));
      if ((s.buildings || []).length) {
        let inner = "";
        for (const b of s.buildings) inner += `<div class="ev-roll-item">${esc(b.name)} — ${esc(b.status || "")}</div>`;
        html += section("Постройки", inner);
      }
      if ((s.stash || []).length) html += section("Кладовая", listItems(s.stash));
      const faith = s.faith || {};
      const cults = Object.entries(faith).filter(([, v]) => v > 0);
      if (cults.length) {
        let inner = "";
        for (const [c, v] of cults) inner += row(c, `${v} дв.`);
        html += section("Вера", inner);
      }
      return html || `<p class="ev-empty">Нет данных.</p>`;
    },
  };

  window.TwRoomPanels = { renderers, esc };
})();
