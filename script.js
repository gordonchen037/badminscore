class GameState {
    constructor() {
        this.teams = {
            A: {
                name: "A 組", members: [],
                s1_scores: { 1: 0, 2: 0, 3: 0 },
                scoreS4: 0
            },
            B: {
                name: "B 組", members: [],
                s1_scores: { 1: 0, 2: 0, 3: 0 },
                scoreS4: 0
            }
        };
        this.stage4 = {
            checkpoints: [7, 14, 20],
            violatedCheckpoints: [],
            roles: {},
            status: {},
            snapshots: {},
            matchCount: 1,
            timer: null
        };
        // Individual Series Tracking
        this.playerSeriesScores = {}; // Map<Name, { team: number, personal: number }>

        this.currentStage = 'setup';
        this.subStage = 1;
    }
}

class UIManager {
    constructor() {
        this.views = {
            setup: document.getElementById('view-setup'),
            stage1: document.getElementById('view-stage1'),
            stage4setup: document.getElementById('view-stage4-setup'),
            stage4game: document.getElementById('view-stage4-game'),
            stage4results: document.getElementById('view-stage4-results'),
            summary: document.getElementById('view-summary')
        };
    }

    switchView(viewName) {
        if (window.app && window.app.state) {
            window.app.state.currentView = viewName;
            window.app.saveState();
        }
        Object.values(this.views).forEach(el => el.classList.remove('active'));
        let target = this.views[viewName];
        if (target) target.classList.add('active');
        if (viewName === 'stage4setup') this.renderScrambleLists();
        this.updateGlobalRanking();
    }

    setSubStage(stageId) {
        app.state.subStage = stageId;
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        const tabs = document.querySelectorAll('.tab');
        if (tabs[stageId - 1]) tabs[stageId - 1].classList.add('active');

        const texts = [
            "1. 發球得分: 發球至指定區域得分。",
            "2. 打倒球筒: 用球打倒對方場地內的球筒。",
            "3. 兩人一拍: 兩人合持一支球拍接球。"
        ];
        document.getElementById('stage-desc').innerText = texts[stageId - 1] || "";
        this.updateStage1Display();
    }

    updateStage1Display() {
        const sub = app.state.subStage;
        document.getElementById('s1-score-a').innerText = app.state.teams.A.s1_scores[sub];
        document.getElementById('s1-score-b').innerText = app.state.teams.B.s1_scores[sub];
    }

    addMemberInput(team) {
        const container = document.getElementById(`team-${team.toLowerCase()}-members`);
        const div = document.createElement('div');
        div.className = 'member-row';
        div.innerHTML = `<input type="text" class="member-input" placeholder="輸入隊員姓名">`;
        container.appendChild(div);
    }

    renderScrambleLists() {
        ['A', 'B'].forEach(team => {
            const container = document.getElementById(`scramble-${team.toLowerCase()}`);
            container.innerHTML = '';
            app.state.teams[team].members.forEach(m => {
                const div = document.createElement('div');
                div.className = 'scramble-item';
                div.innerHTML = `
                    <span>${m}</span>
                    <button class="btn-toggle-team" onclick="app.movePlayer('${m}', '${team}')">
                        換到 ${team === 'A' ? 'B' : 'A'} 組 ➡️
                    </button>
                 `;
                container.appendChild(div);
            });
        });
    }

    renderLiveStatus() {
        ['A', 'B'].forEach(team => {
            const container = document.getElementById(`s4-live-${team.toLowerCase()}`);
            container.innerHTML = '';
            app.state.teams[team].members.forEach(m => {
                const status = app.state.stage4.status[m];
                const card = document.createElement('div');
                card.className = `player-card ${status === 'Eliminated' ? 'eliminated' : ''}`;
                const reviveBtn = status === 'Eliminated'
                    ? `<button class="btn-toggle-team" style="background:var(--accent-primary); color:#000;" onclick="app.manualRevive('${m}')">復活</button>` : '';
                card.innerHTML = `<span>${m}</span><div style="display:flex;align-items:center;gap:5px;">${reviveBtn}<span class="status-indicator ${status === 'Eliminated' ? 'out' : ''}"></span></div>`;
                container.appendChild(card);
            });
        });
    }

    showVoteModal(triggerScore) {
        // Reset Modal UI State (Fix for 2-1)
        document.getElementById('voting-section').style.display = 'flex';
        document.getElementById('elimination-resolution').style.display = 'none';

        // Clear previous resolution buttons/content to prevent selector conflict
        document.getElementById('eliminated-list').innerHTML = '';

        const confirmBtn = document.getElementById('btn-confirm-vote');
        if (confirmBtn) confirmBtn.style.display = 'block';

        // Auto-Eliminate Revived Veterans (Fix for 2)
        if (app.state.stage4.revivedVeterans) {
            app.state.stage4.revivedVeterans.forEach(p => {
                if (app.state.stage4.status[p] !== 'Eliminated') {
                    const team = app.state.teams.A.members.includes(p) ? 'A' : 'B';
                    app.state.stage4.status[p] = "Eliminated";
                    app.state.stage4.snapshots[p] = app.state.teams[team].scoreS4;
                    alert(`老手 ${p} 雖然復活，但在本次休息檢討時自動離場 (規則: 復活至下一賽局休息才下場)`);
                }
            });
            // Clear the list so they don't get re-processed (though status is already Eliminated)
            app.state.stage4.revivedVeterans = new Set();
        }

        const modal = document.getElementById('modal-vote');
        document.getElementById('cp-score').innerText = triggerScore;

        ['A', 'B'].forEach(team => {
            const list = document.getElementById(`vote-list-${team.toLowerCase()}`);
            list.innerHTML = '';
            const members = app.state.teams[team].members;
            const activeMembers = members.filter(m => app.state.stage4.status[m] !== 'Eliminated');

            const threshold = Math.ceil(activeMembers.length / 2);
            document.getElementById(`thresh-${team.toLowerCase()}`).innerText = threshold > 0 ? threshold : 0;

            activeMembers.forEach(p => {
                const div = document.createElement('div');
                div.className = 'vote-row';
                div.innerHTML = `<span>${p}</span><input type="number" min="0" class="vote-input" data-player="${p}" data-team="${team}">`;
                list.appendChild(div);
            });

            // If no active members, show message?
            if (activeMembers.length === 0) list.innerHTML = '<div style="opacity:0.5; padding:5px;">全員皆已淘汰</div>';
        });

        modal.classList.add('active');

        let timeLeft = 60;
        const timerDisplay = document.getElementById('vote-timer');
        timerDisplay.innerText = timeLeft;
        if (this.voteTimerInterval) clearInterval(this.voteTimerInterval);
        this.voteTimerInterval = setInterval(() => {
            timeLeft--;
            timerDisplay.innerText = timeLeft;
            if (timeLeft <= 0) {
                clearInterval(this.voteTimerInterval);
                timerDisplay.innerText = "時間到！";
            }
        }, 1000);
    }

    hideModal(id) {
        document.getElementById(id).classList.remove('active');
    }

    toggleGlobalScoreboard() {
        const modal = document.getElementById('modal-global-score');
        if (modal.classList.contains('active')) {
            modal.classList.remove('active');
        } else {
            this.updateGlobalRanking();
            modal.classList.add('active');
        }
    }

    updateGlobalRanking() {
        const list = document.getElementById('global-ranking-list');
        list.innerHTML = '';

        // Get all players that have scores or are currently in team
        // Merge current members + history
        const allNames = new Set([
            ...Object.keys(app.state.playerSeriesScores),
            ...app.state.teams.A.members,
            ...app.state.teams.B.members
        ]);

        // Sort by Score Desc
        const sorted = Array.from(allNames).map(name => {
            const s1 = app.calculateStage1ScoreForPlayer(name);
            const s4 = app.state.playerSeriesScores[name] || { team: 0, personal: 0 };

            // User Request: Stage 4 Score should be Personal Score.
            // So Team Score = Stage 1-3 (s1).
            // Personal Score = All Stage 4 (s4.team + s4.personal).
            // Note: In nextMatch we will ensure s4.team is 0 to avoid confusion, but here we sum them just in case.

            const totalTeam = s1;
            const totalPersonal = s4.team + s4.personal;
            return {
                name: name,
                total: totalTeam + totalPersonal,
                team: totalTeam,
                personal: totalPersonal
            };
        }).sort((a, b) => b.total - a.total);

        if (sorted.length === 0) {
            list.innerHTML = '<div style="padding:10px;text-align:center;">尚無資料</div>';
            return;
        }

        // Table Header
        list.innerHTML = `
            <table style="width:100%; text-align:left; border-collapse:collapse;">
                <tr style="border-bottom:1px solid rgba(255,255,255,0.2);">
                    <th style="padding:5px;">名次</th>
                    <th style="padding:5px;">玩家</th>
                    <th style="padding:5px; text-align:right;">總分</th>
                    <th style="padding:5px; text-align:right; color:var(--accent-secondary);">團體</th>
                    <th style="padding:5px; text-align:right; color:var(--accent-primary);">個人</th>
                </tr>
            </table>
        `;
        const table = list.querySelector('table');

        sorted.forEach((item, index) => {
            const tr = document.createElement('tr');
            tr.style.borderBottom = "1px solid rgba(255,255,255,0.05)";
            let icon = index === 0 ? '🥇' : (index === 1 ? '🥈' : (index === 2 ? '🥉' : `#${index + 1}`));

            tr.innerHTML = `
                <td style="padding:8px 5px;">${icon}</td>
                <td style="padding:8px 5px;">${item.name}</td>
                <td style="padding:8px 5px; text-align:right; font-weight:bold;">${item.total}</td>
                <td style="padding:8px 5px; text-align:right; opacity:0.8;">${item.team}</td>
                <td style="padding:8px 5px; text-align:right; opacity:0.8;">${item.personal}</td>
            `;
            table.appendChild(tr);
        });
    }

    renderRoleAssignTable() {
        const container = document.getElementById('role-assign-container');
        container.innerHTML = '';
        const table = document.createElement('table');
        table.className = 'results-table';
        table.innerHTML = `<thead><tr><th>隊伍</th><th>玩家</th><th>狀態</th><th>選擇身份</th></tr></thead><tbody id="role-tbody"></tbody>`;
        container.appendChild(table);
        const tbody = table.querySelector('tbody');

        const allPlayers = [];
        app.state.teams.A.members.forEach(m => allPlayers.push({ p: m, t: 'A' }));
        app.state.teams.B.members.forEach(m => allPlayers.push({ p: m, t: 'B' }));

        allPlayers.forEach(obj => {
            const { p, t } = obj;
            const status = app.state.stage4.status[p];
            const row = document.createElement('tr');

            // Veteran Selector Logic
            let extraControls = '';
            if (status === 'Eliminated') {
                // Build a teammate selector just in case they choose Veteran
                // We will hide/show it via JS or just always show it but only use it if Veteran is selected?
                // Better: onChange listener on the select.
                const teammates = allPlayers.filter(x => x.t === t && x.p !== p);
                const options = teammates.map(tm => `<option value="${tm.p}">${tm.p}</option>`).join('');
                extraControls = `
                    <div class="veteran-controls" id="vet-ctrl-${p}" style="display:none; margin-top:5px; font-size:0.9em;">
                        <span>指定隊友(獲半分):</span>
                        <select class="vet-target-select" data-player="${p}">
                           <option value="">-- 無 --</option>
                           ${options}
                        </select>
                    </div>
                 `;
            }

            row.innerHTML = `
                <td style="color: var(--team-${t.toLowerCase()}-color)">${t} 組</td>
                <td>${p}</td>
                <td>${status === 'Eliminated' ? '已淘汰' : '存活'}</td>
                <td>
                    <select class="role-select" data-player="${p}" onchange="ui.onRoleChange('${p}', this.value)">
                        <option value="Player">選手 (Player)</option>
                        <option value="Spy">間諜 (Spy)</option>
                        <option value="Veteran">老手 (Veteran)</option>
                        <option value="Passerby">路人 (Passerby)</option>
                    </select>
                    ${extraControls}
                </td>`;
            tbody.appendChild(row);
        });
    }

    onRoleChange(player, role) {
        const ctrl = document.getElementById(`vet-ctrl-${player}`);
        if (ctrl) {
            ctrl.style.display = role === 'Veteran' ? 'block' : 'none';
        }
    }
}

class App {
    constructor() {
        this.state = new GameState();
        this.ui = new UIManager();
        // Default UI Setup (Will be overridden by loadState if save exists)
        this.ui.addMemberInput('A'); this.ui.addMemberInput('A');
        this.ui.addMemberInput('B'); this.ui.addMemberInput('B');
    }

    saveState() {
        const stateToSave = JSON.parse(JSON.stringify(this.state));
        // Convert Set to Array for JSON
        if (this.state.stage4.revivedVeterans) {
            stateToSave.stage4.revivedVeterans = Array.from(this.state.stage4.revivedVeterans);
        }
        localStorage.setItem('scoreclick_state', JSON.stringify(stateToSave));
    }

    loadState() {
        const saved = localStorage.getItem('scoreclick_state');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                this.state = parsed;
                // Restore Set
                if (this.state.stage4.revivedVeterans) {
                    this.state.stage4.revivedVeterans = new Set(this.state.stage4.revivedVeterans);
                } else {
                    // Ensure it exists if old save
                    // Actually GameState def doesn't have it by default, logic adds it.
                }

                // Restore UI
                // 1. Restore Members Inputs if in Setup
                if (this.state.currentStage === 'setup') {
                    ['A', 'B'].forEach(t => {
                        const container = document.getElementById(`team-${t.toLowerCase()}-members`);
                        container.innerHTML = ''; // Clear defaults
                        this.state.teams[t].members.forEach(m => {
                            this.ui.addMemberInput(t);
                            // We just added an empty input, need to fill it.
                            // But wait, addMemberInput creates a DOM element.
                            // We don't have direct ref. 
                            // Simplify: Just render existing members into inputs?
                            // Actually `members` array is populated on startStage1. 
                            // If we are in 'setup', members array might be empty if we haven't started?
                            // If we saved *during* setup, we might lose input values unless we track them input-by-input. 
                            // For now, assume 'setup' save is rare or we just handle "After Start".

                            // If we are past setup, we rely on state objects.
                        });
                        // If members array is populated (e.g. came back to setup?), fill inputs.
                        const inputs = container.querySelectorAll('input');
                        this.state.teams[t].members.forEach((m, i) => {
                            if (inputs[i]) inputs[i].value = m;
                        });
                    });
                }

                // Restore UI using currentView
                if (this.state.currentView) {
                    this.ui.switchView(this.state.currentView);

                    if (this.state.currentView === 'stage1') {
                        this.ui.updateStage1Display();
                    } else if (this.state.currentView === 'stage4game') {
                        this.ui.renderLiveStatus();
                        document.getElementById('match-count').innerText = this.state.stage4.matchCount;
                        document.getElementById('s4-score-a').innerText = this.state.teams.A.scoreS4;
                        document.getElementById('s4-score-b').innerText = this.state.teams.B.scoreS4;
                    } else if (this.state.currentView === 'stage4setup') {
                        this.ui.renderScrambleLists();
                    }
                } else {
                    // Fallback using heuristics (for older saves)
                    if (this.state.teams.A.scoreS4 > 0 || this.state.teams.B.scoreS4 > 0 || this.state.stage4.matchCount > 1) {
                        this.ui.switchView('stage4game');
                        this.ui.renderLiveStatus();
                        // Restore scoreboard values
                        document.getElementById('match-count').innerText = this.state.stage4.matchCount;
                        document.getElementById('s4-score-a').innerText = this.state.teams.A.scoreS4;
                        document.getElementById('s4-score-b').innerText = this.state.teams.B.scoreS4;
                    } else if (this.state.teams.A.members.length > 0) {
                        this.ui.switchView('stage1');
                        this.ui.updateStage1Display();
                    } else {
                        this.ui.switchView('setup');
                    }
                }
            } catch (e) {
                console.error("Load failed", e);
                return false;
            }
            return true;
        }
        return false;
    }

    resetGame() {
        if (confirm("確定要刪除紀錄並重置比賽？")) {
            localStorage.removeItem('scoreclick_state');
            location.reload();
        }
    }

    calculateStage1ScoreForPlayer(player) {
        let team = null;
        if (this.state.teams.A.members.includes(player)) team = 'A';
        else if (this.state.teams.B.members.includes(player)) team = 'B';

        if (!team) return 0;

        const scores = this.state.teams[team].s1_scores;
        return (scores[1] || 0) + (scores[2] || 0) + (scores[3] || 0);
    }

    startStage1() {
        const inputsA = document.querySelectorAll('#team-a-members input');
        this.state.teams.A.members = Array.from(inputsA).map(i => i.value).filter(v => v);
        const inputsB = document.querySelectorAll('#team-b-members input');
        this.state.teams.B.members = Array.from(inputsB).map(i => i.value).filter(v => v);

        if (this.state.teams.A.members.length === 0 || this.state.teams.B.members.length === 0) {
            alert("請輸入隊員姓名！"); return;
        }

        // Init scores for players
        [...this.state.teams.A.members, ...this.state.teams.B.members].forEach(m => {
            if (this.state.playerSeriesScores[m] === undefined) this.state.playerSeriesScores[m] = { team: 0, personal: 0 };
        });

        this.ui.switchView('stage1');
        this.ui.updateStage1Display();
    }

    updateStage1Score(team, delta) {
        const sub = this.state.subStage;
        this.state.teams[team].s1_scores[sub] += delta;
        if (this.state.teams[team].s1_scores[sub] < 0) this.state.teams[team].s1_scores[sub] = 0;
        this.ui.updateStage1Display();
    }

    startStage4Setup() { this.ui.switchView('stage4setup'); }

    movePlayer(player, fromTeam) {
        this.state.teams[fromTeam].members = this.state.teams[fromTeam].members.filter(m => m !== player);
        const targetTeam = fromTeam === 'A' ? 'B' : 'A';
        this.state.teams[targetTeam].members.push(player);
        this.ui.renderScrambleLists();
    }

    startStage4Game() {
        const allPlayers = [...this.state.teams.A.members, ...this.state.teams.B.members];
        allPlayers.forEach(p => {
            this.state.stage4.status[p] = "Active";
            this.state.stage4.snapshots[p] = 0;
            // Ensure series score init
            if (this.state.playerSeriesScores[p] === undefined) this.state.playerSeriesScores[p] = { team: 0, personal: 0 };
        });
        document.getElementById('match-count').innerText = this.state.stage4.matchCount;
        this.ui.renderLiveStatus();
        this.ui.switchView('stage4game');
    }

    scoreStage4(team, delta) {
        this.state.teams[team].scoreS4 += delta;
        if (this.state.teams[team].scoreS4 < 0) this.state.teams[team].scoreS4 = 0;
        document.getElementById(`s4-score-${team.toLowerCase()}`).innerText = this.state.teams[team].scoreS4;

        const score = this.state.teams[team].scoreS4;
        if (this.state.stage4.checkpoints.includes(score)) {
            if (!this.state.stage4.violatedCheckpoints.includes(score)) {
                this.state.stage4.violatedCheckpoints.push(score);
                ui.showVoteModal(score);
            }
        }
    }

    confirmVotes() {
        const eliminatedPlayers = [];
        ['A', 'B'].forEach(team => {
            const inputs = document.querySelectorAll(`.vote-input[data-team="${team}"]`);
            const members = this.state.teams[team].members;
            const activeMembers = members.filter(m => this.state.stage4.status[m] !== 'Eliminated');
            const threshold = Math.ceil(activeMembers.length / 2);

            if (activeMembers.length > 0) {
                inputs.forEach(inp => {
                    const votes = parseInt(inp.value) || 0;
                    if (votes >= threshold) {
                        eliminatedPlayers.push(inp.dataset.player);
                    }
                });
            }
        });

        if (eliminatedPlayers.length > 0) {
            // Show Resolution UI instead of alert/close
            document.getElementById('voting-section').style.display = 'none';
            document.getElementById('elimination-resolution').style.display = 'block';
            const confirmBtn = document.getElementById('btn-confirm-vote');
            if (confirmBtn) confirmBtn.style.display = 'none'; // Hide Confirm button

            const container = document.getElementById('eliminated-list');
            container.innerHTML = '';

            eliminatedPlayers.forEach(p => {
                const team = this.state.teams.A.members.includes(p) ? 'A' : 'B';
                const teammates = this.state.teams[team].members.filter(m => m !== p);

                const div = document.createElement('div');
                div.className = 'elim-item';
                div.style.marginBottom = "10px";
                div.style.padding = "10px";
                div.style.background = "rgba(255,255,255,0.1)";
                div.style.borderRadius = "8px";

                div.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-size:1.2em; font-weight:bold;">${p} (淘汰)</span>
                        <button class="btn btn-sm btn-warning" onclick="app.showVeteranOptions('${p}', '${team}')">我是老手 ✋</button>
                    </div>
                    <div id="vet-opts-${p}" style="display:none; margin-top:10px;">
                        <button class="btn btn-sm btn-success" onclick="app.veteranAction('${p}', 'revive')">1. 復活 (至下一局)</button>
                        <div style="margin-top:5px;">
                            <span>2. 獲得隊友一半分數:</span>
                            <select id="vet-target-${p}" onchange="app.veteranAction('${p}', 'share', this.value)">
                                <option value="">--選擇隊友--</option>
                                ${teammates.map(tm => `<option value="${tm}">${tm}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                `;
                container.appendChild(div);

                // Mark as Eliminated initially
                const currentScore = this.state.teams[team].scoreS4;
                this.state.stage4.status[p] = "Eliminated";
                this.state.stage4.snapshots[p] = currentScore;
            });

            // Add a "Done" button to close modal
            const doneBtn = document.createElement('button');
            doneBtn.className = 'btn btn-primary full-width';
            doneBtn.style.marginTop = '15px';
            doneBtn.innerText = '完成確認';
            doneBtn.onclick = () => {
                this.ui.hideModal('modal-vote');
                // Reset Modal UI for next time
                document.getElementById('voting-section').style.display = 'flex';
                document.getElementById('elimination-resolution').style.display = 'none';
                const cBtn = document.getElementById('btn-confirm-vote');
                if (cBtn) cBtn.style.display = 'block';
                this.ui.renderLiveStatus();
            };
            container.appendChild(doneBtn);

        } else {
            alert("無人淘汰！");
            this.ui.hideModal('modal-vote');
            this.ui.renderLiveStatus();
        }
    }

    showVeteranOptions(player) {
        document.getElementById(`vet-opts-${player}`).style.display = 'block';

        // Fix 1: Mark as Veteran (since they claimed it)
        this.state.stage4.roles[player] = 'Veteran';

        // Visual feedback to user
        const btn = event.target;
        if (btn) {
            btn.innerText = "已確認為老手";
            btn.disabled = true;
            btn.classList.add('btn-disabled');
        }
    }

    veteranAction(player, type, target) {
        if (type === 'revive') {
            if (confirm('確定要復活至下一賽局休息才下場？(此局視為存活)')) {
                this.state.stage4.status[player] = "Active";
                this.state.stage4.snapshots[player] = 0; // Reset snapshot

                // Track for next checkpoint
                if (!this.state.stage4.revivedVeterans) this.state.stage4.revivedVeterans = new Set();
                this.state.stage4.revivedVeterans.add(player);

                // Visual feedback
                document.getElementById(`vet-opts-${player}`).innerHTML = '<span style="color:#4caf50">已復活！(下次休息時自動離場)</span>';
            }
        } else if (type === 'share') {
            if (!target) return;
            // Record target for end game calc
            if (!this.state.stage4.veteranTargets) this.state.stage4.veteranTargets = {};
            this.state.stage4.veteranTargets[player] = target;
            // They stay eliminated
            alert(`已選擇獲得 ${target} 的一半分數。`);
        }
    }

    manualRevive(player) {
        if (confirm(`確定要復活 ${player} 嗎？`)) {
            this.state.stage4.status[player] = "Active";
            this.state.stage4.snapshots[player] = 0;
            this.ui.renderLiveStatus();
        }
    }

    finishStage4Match() {
        if (!confirm("確定結束比賽並進入結算？")) return;
        this.ui.renderRoleAssignTable();
        this.ui.switchView('stage4results');
    }

    calculateAndShowFinal() {
        const selects = document.querySelectorAll('.role-select');
        this.state.stage4.roles = {};
        selects.forEach(sel => this.state.stage4.roles[sel.dataset.player] = sel.value);

        const vetSelects = document.querySelectorAll('.vet-target-select');
        this.state.stage4.veteranTargets = {};
        vetSelects.forEach(sel => this.state.stage4.veteranTargets[sel.dataset.player] = sel.value);

        const results = this.computeResultsLogic();
        this.renderFinalSummary(results);
        this.ui.switchView('summary');
    }

    computeResultsLogic() {
        const scoreA = this.state.teams.A.scoreS4;
        const scoreB = this.state.teams.B.scoreS4;
        const winnerTeam = scoreA > scoreB ? 'A' : (scoreB > scoreA ? 'B' : 'Draw');
        const allPlayers = [...this.state.teams.A.members, ...this.state.teams.B.members];
        const computedResults = [];

        // Check if spies survived
        const spySurvived = {
            A: this.state.teams.A.members.some(m => this.state.stage4.roles[m] === 'Spy' && this.state.stage4.status[m] !== 'Eliminated'),
            B: this.state.teams.B.members.some(m => this.state.stage4.roles[m] === 'Spy' && this.state.stage4.status[m] !== 'Eliminated')
        };

        // Count eliminated spies per team (for "Find the Spy" bonus)
        const eliminatedSpyCount = {
            A: this.state.teams.A.members.filter(m => this.state.stage4.roles[m] === 'Spy' && this.state.stage4.status[m] === 'Eliminated').length,
            B: this.state.teams.B.members.filter(m => this.state.stage4.roles[m] === 'Spy' && this.state.stage4.status[m] === 'Eliminated').length
        };

        // First Pass: Calculate Base Scores and Personal Bonus
        const tempResults = {};

        allPlayers.forEach(p => {
            const team = this.state.teams.A.members.includes(p) ? 'A' : 'B';
            const opponentTeam = team === 'A' ? 'B' : 'A';
            const role = this.state.stage4.roles[p];
            const status = this.state.stage4.status[p];

            // Base Score: If eliminated, snapshot. If survivor, team score.
            let baseScore = status === 'Eliminated' ? (this.state.stage4.snapshots[p] || 0) : this.state.teams[team].scoreS4;
            let personalBonus = 0;

            // Rule: "比賽結束時若該隊間諜有被找出，存活的隊員額外增加找出間諜數*5分"
            if (status !== 'Eliminated') {
                personalBonus += (eliminatedSpyCount[team] * 5);
            }

            if (role === 'Spy') {
                // If alive, get Opponent Score / 2 (Ceil)
                if (status !== 'Eliminated') {
                    personalBonus += Math.ceil(this.state.teams[opponentTeam].scoreS4 / 2);
                }
                // If opponent wins, +5
                if (winnerTeam === opponentTeam) {
                    personalBonus += 5;
                }
            }
            else if (role === 'Passerby') {
                if (status === 'Eliminated') {
                    // Score * 1.5 (Ceil) -> This replaces the base score logic effectively
                    // User says: "If voted out, score * 1.5". 
                    // Base was snapshot. So snapshot * 1.5.
                    // The difference (snapshot * 0.5) is personal bonus.
                    const originalBase = baseScore;
                    baseScore = Math.ceil(originalBase * 1.5);
                    // To keep "Team vs Personal" clean, maybe we attribute the extra 0.5x to personal?
                    // Let's say Personal = Final - OriginalBase.
                } else {
                    // Alive -> +5
                    personalBonus += 5;
                }
            }
            else if (role === 'Veteran') {
                // If Eliminated: Can choose 1 or 2.
                // 1. Revive (Handled in game?) -> "Revive to next game" means they are out this game but maybe get full team score? 
                //    Wait, "Revive to next game rest only then exit". This sounds like a gameplay mechanic not just scoring. 
                //    But if we are at calculation, they are currently "Eliminated".
                //    If they chose Option 2 "Get half of teammate's score", we need to know WHICH teammate.
                //    We'll assume we handle the "half teammate score" here if a teammate was selected.
                const teammateTarget = this.state.stage4.veteranTargets ? this.state.stage4.veteranTargets[p] : null;
                if (teammateTarget && status === 'Eliminated') {
                    // We need to wait for second pass to get teammate's score? 
                    // Or just teammate's BASE score? "End of game score". 
                    // Usually implies the teammates final score. Let's do it in second pass.
                }
            }
            else if (role === 'Player') {
                // If no spy survived in OWN team -> Score * 2
                if (!spySurvived[team]) {
                    const originalBase = baseScore;
                    baseScore = originalBase * 2;
                }
                // If Own team wins -> +5
                if (winnerTeam === team) {
                    personalBonus += 5;
                }
            }

            tempResults[p] = { team, role, status, base: baseScore, personal: personalBonus, final: baseScore + personalBonus };
        });

        // Second Pass: Veteran Bonuses (Dependent on others)
        allPlayers.forEach(p => {
            const r = tempResults[p];
            if (r.role === 'Veteran' && r.status === 'Eliminated') {
                const target = this.state.stage4.veteranTargets ? this.state.stage4.veteranTargets[p] : null;
                if (target && tempResults[target]) {
                    // "half of selected teammate's score at end of game"
                    // Assuming teammate's TOTAL score for this match?
                    const targetScore = tempResults[target].final;
                    const bonus = Math.ceil(targetScore / 2);
                    r.personal += bonus;
                    r.final += bonus;
                }
            }

            // Final check for Passerby to ensure 1.5x logic didn't get messed up (it was local to baseScore)
            // ... looks ok.

            computedResults.push({
                name: p,
                team: r.team,
                role: r.role,
                status: r.status,
                base: r.base,
                personal: r.personal,
                final: r.final
            });
        });

        return computedResults;
    }

    renderFinalSummary(results) {
        const s1TotalA = this.state.teams.A.s1_scores[1] + this.state.teams.A.s1_scores[2] + this.state.teams.A.s1_scores[3];
        const s1TotalB = this.state.teams.B.s1_scores[1] + this.state.teams.B.s1_scores[2] + this.state.teams.B.s1_scores[3];
        document.getElementById('sum-s1-a').innerText = s1TotalA;
        document.getElementById('sum-s1-b').innerText = s1TotalB;

        // Display Match Score (Fix for 3)
        // Find existing match info container or create one above table
        let matchInfo = document.getElementById('match-results-header');
        if (!matchInfo) {
            matchInfo = document.createElement('div');
            matchInfo.id = 'match-results-header';
            matchInfo.style.textAlign = 'center';
            matchInfo.style.marginBottom = '20px';
            matchInfo.style.fontSize = '1.5em';
            matchInfo.style.fontWeight = 'bold';
            const wrapper = document.querySelector('.results-table-wrapper');
            wrapper.parentNode.insertBefore(matchInfo, wrapper);
        }
        matchInfo.innerHTML = `
            <span style="color:var(--team-a-color)">A 組: ${this.state.teams.A.scoreS4}</span>
            <span style="margin:0 15px;">VS</span>
            <span style="color:var(--team-b-color)">B 組: ${this.state.teams.B.scoreS4}</span>
        `;

        const tbody = document.getElementById('final-results-body');
        tbody.innerHTML = '';

        // Sort by Team (A first) then Name
        results.sort((a, b) => {
            if (a.team !== b.team) return a.team.localeCompare(b.team);
            return a.name.localeCompare(b.name);
        });

        results.forEach(r => {
            const row = document.createElement('tr');

            // Team indicator
            row.style.borderLeft = `4px solid ${r.team === 'A' ? 'var(--team-a-color)' : 'var(--team-b-color)'}`;
            row.style.background = r.team === 'A' ? 'rgba(255, 99, 71, 0.05)' : 'rgba(30, 144, 255, 0.05)';

            // Veteran Link
            let roleText = this.translateRole(r.role);
            if (r.role === 'Veteran' && r.status === 'Eliminated') {
                const target = this.state.stage4.veteranTargets ? this.state.stage4.veteranTargets[r.name] : null;
                if (target) roleText += `<br><span style="font-size:0.8em; color:yellow;">➡ 綁定: ${target}</span>`;
            }

            // Create Input for the Final Score (Editable)
            // Store base score in data attribute for split calculation later
            const inputHtml = `<input type="number" class="score-edit-input" data-player="${r.name}" data-base="${r.base}" value="${r.final}" style="width:60px;">`;

            const detailText = `<span style="font-size:0.9em; color:#aaa;">${r.base} + ${r.personal}</span>`;

            row.innerHTML = `<td>${r.name} <span style="font-size:0.8em; opacity:0.6;">(${r.team})</span></td><td>${roleText}</td><td>${r.status === 'Eliminated' ? '已淘汰' : '存活'}</td><td>${detailText}</td><td>${inputHtml}</td>`;
            tbody.appendChild(row);
        });
    }

    nextMatch() {
        // 1. Harvest Edited Scores
        const inputs = document.querySelectorAll('.score-edit-input');
        inputs.forEach(inp => {
            const player = inp.dataset.player;
            const finalScore = parseInt(inp.value) || 0;
            const originalBase = parseInt(inp.dataset.base) || 0;

            // Heuristic: If User edited the score, we attribute the difference to "Personal".
            // If strictly calculated, we have base (Team component roughly) and personal (Bonus).
            // But wait, "Base" for Spy/Passerby might have multipliers.
            // Let's stick to: "Team" = The Stage 4 Checkpoint Score (or Snapshot).
            // "Personal" = Everything else (Multipliers, Bonuses).
            // We stored 'base' in data-base.

            let teamComponent = originalBase;
            let personalComponent = finalScore - teamComponent;

            // Edge case: If teamComponent is from snapshot, it's "Team Score at that moment".
            // So yes, strictly speaking it is the "Team" contribution.

            // User Request: S4 Score is Personal.
            // We shift all points to personal.
            let totalS4 = teamComponent + personalComponent;

            if (this.state.playerSeriesScores[player] === undefined) this.state.playerSeriesScores[player] = { team: 0, personal: 0 };
            this.state.playerSeriesScores[player].team += 0; // S4 adds nothing to Team Score (S1-3 only)
            this.state.playerSeriesScores[player].personal += totalS4;
        });

        // 3. Reset Match State
        this.state.teams.A.scoreS4 = 0;
        this.state.teams.B.scoreS4 = 0;
        this.state.stage4.violatedCheckpoints = [];
        this.state.stage4.matchCount++;

        document.getElementById('s4-score-a').innerText = 0;
        document.getElementById('s4-score-b').innerText = 0;

        this.ui.switchView('stage4setup');
    }

    translateRole(role) {
        const map = { 'Player': '選手', 'Spy': '間諜', 'Veteran': '老手', 'Passerby': '路人' };
        return map[role] || role;
    }
}

const ui = new UIManager();
const app = new App();
window.ui = ui;
window.app = app;

// Init State
if (!app.loadState()) {
    // If no state loaded, keep defaults
}
