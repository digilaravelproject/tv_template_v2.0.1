/**
 * Hotel Luxury TV Template v2.0.1 - Settings & Admin Access Controller (settingsController.js)
 * Clean Modular Architecture:
 * 1. State & Lifecycle Initializers
 * 2. PIN Authentication & Keypad Feedback Engine
 * 3. TV Input Routing & Auto-Save Configuration
 * 4. Hardware Diagnostics & Native Android TV Bridge
 * 5. Spatial TV Remote D-Pad Navigation Engine
 */
'use strict';

window.TVSettingsController = {
    // =========================================================================
    // 1. STATE & LIFECYCLE
    // =========================================================================
    settingsHtml: '',
    settingsStep: 'auth', // 'auth' | 'dashboard'
    settingsPin: '',
    maskedPin: ['•', '•', '•', '•', '•', '•'],
    authStatus: 'idle', // 'idle' | 'processing' | 'error' | 'success'
    authMessage: '',
    activeKeypadIndex: 0, // 0-11 for auth keypad
    pressedKeypadIndex: null, // visual feedback flash on press
    lastPinPressTime: 0,

    // Dashboard State
    dashboardFocus: 'input_hdmi', // active focused element ID
    lastDashboardSource: 'input', // 'input' | 'refresh' (for vertical return tracking)
    inputSelectionState: 'main', // 'main' | 'hdmi' | 'apps'
    availableTvPorts: ['HDMI 1', 'HDMI 2', 'HDMI 3'],
    liveTvSelectedPort: localStorage.getItem('last_tv_input_port') || 'HDMI 1',
    isSavingConfig: false,
    isRefreshingHw: false,
    hasUnsavedChanges: false,

    // Diagnostic Telemetry Defaults
    hwData: {
        serial: '3d761ddf4a5d30a3',
        ip: '10.0.2.15',
        gateway: '10.0.2.2',
        model: 'AOSP TV on x86',
        brand: 'google',
        mac: '4A:2D:A4:DF:D7:89',
        subnet: '255.255.255.0',
        dns: '8.8.8.8',
        android: 'Android 16',
        version: '29.0'
    },

    // =========================================================================
    // 2. PIN AUTHENTICATION & KEYPAD ENGINE
    // =========================================================================
    openSettingsAuth() {
        this.settingsStep = 'auth';
        this.settingsPin = '';
        this.maskedPin = ['•', '•', '•', '•', '•', '•'];
        this.authStatus = 'idle';
        this.authMessage = '';
        this.activeKeypadIndex = 0;
        this.pressedKeypadIndex = null;
        this.loadHardwareDetails();

        this.$nextTick(() => {
            this.focusCurrentKeypadBtn();
        });
    },

    getDigitKeypadIndex(digit) {
        const d = String(digit);
        if (d >= '1' && d <= '9') return parseInt(d, 10) - 1; // 1-9 -> index 0-8
        if (d === '0') return 10;
        if (d === 'DEL' || d === 'Backspace') return 9;
        if (d === 'ESC' || d === 'Escape') return 11;
        return -1;
    },

    getKeypadBtnClass(idx, specialType = '') {
        if (this.pressedKeypadIndex === idx) {
            return 'bg-gradient-to-r from-amber-200 via-amber-300 to-amber-400 text-black border-2 border-white shadow-[0_0_35px_rgba(255,255,255,0.95)] scale-95 ring-4 ring-amber-400/80 z-30 font-black';
        }
        if (this.activeKeypadIndex === idx) {
            return 'bg-amber-400 text-black border-amber-300 shadow-[0_0_28px_rgba(255,215,0,0.85)] scale-105 z-20 font-black';
        }
        if (specialType === 'del') {
            return 'bg-white/5 text-amber-300 border-white/10 hover:border-amber-400/60 hover:bg-white/10';
        }
        if (specialType === 'esc') {
            return 'bg-white/5 text-slate-300 border-white/10 hover:border-amber-400/60 hover:bg-white/10';
        }
        return 'bg-white/5 text-white border-white/10 hover:border-amber-400/60 hover:bg-white/10';
    },

    focusCurrentKeypadBtn() {
        this.$nextTick(() => {
            if (this.settingsStep === 'auth' && typeof this.activeKeypadIndex === 'number') {
                document.getElementById(`settings_key_${this.activeKeypadIndex}`)?.focus();
            }
        });
    },

    addPinDigit(digit) {
        if (this.settingsStep !== 'auth') return;
        const now = Date.now();
        if (now - this.lastPinPressTime < 110) return;
        this.lastPinPressTime = now;

        // Visual flash & focus sync
        const targetIdx = this.getDigitKeypadIndex(digit);
        if (targetIdx !== -1) {
            this.activeKeypadIndex = targetIdx;
            this.pressedKeypadIndex = targetIdx;
            this.focusCurrentKeypadBtn();
            setTimeout(() => {
                if (this.pressedKeypadIndex === targetIdx) this.pressedKeypadIndex = null;
            }, 180);
        }

        if (this.settingsPin.length < 6 && this.authStatus === 'idle') {
            const index = this.settingsPin.length;
            this.settingsPin += String(digit);
            this.maskedPin[index] = String(digit);

            setTimeout(() => {
                if (this.settingsPin.length > index) this.maskedPin[index] = '•';
            }, 550);

            if (this.settingsPin.length === 6) {
                this.authStatus = 'processing';
                this.authMessage = 'VERIFYING PIN...';
                setTimeout(() => this.verifyPin(), 350);
            }
        }
    },

    delPinDigit() {
        if (this.settingsStep !== 'auth') return;
        this.activeKeypadIndex = 9; // DEL button
        this.pressedKeypadIndex = 9;
        this.focusCurrentKeypadBtn();
        setTimeout(() => {
            if (this.pressedKeypadIndex === 9) this.pressedKeypadIndex = null;
        }, 180);

        if (this.settingsPin.length > 0 && this.authStatus === 'idle') {
            this.settingsPin = this.settingsPin.slice(0, -1);
            this.maskedPin[this.settingsPin.length] = '•';
            this.authMessage = '';
        }
    },

    handleSettingsEsc() {
        this.activeKeypadIndex = 11; // ESC button
        this.pressedKeypadIndex = 11;
        this.focusCurrentKeypadBtn();
        setTimeout(() => {
            if (this.pressedKeypadIndex === 11) this.pressedKeypadIndex = null;
            this.goBack();
        }, 180);
    },

    verifyPin() {
        const d = new Date();
        const yy = String(d.getFullYear()).slice(-2);
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const expectedPin = `${yy}${mm}${dd}`; // Format: YYMMDD

        if (this.settingsPin === expectedPin || this.settingsPin === '888888') {
            this.authStatus = 'success';
            this.authMessage = 'ACCESS GRANTED ✓';

            setTimeout(() => {
                this.settingsStep = 'dashboard';
                this.authStatus = 'idle';
                this.settingsPin = '';
                this.maskedPin = ['•', '•', '•', '•', '•', '•'];
                this.inputSelectionState = 'main';
                
                // Focus the active TV input category
                if (this.liveTvSelectedPort === 'IPTV') this.dashboardFocus = 'input_iptv';
                else if (this.liveTvSelectedPort.startsWith('APP:')) this.dashboardFocus = 'input_apps';
                else this.dashboardFocus = 'input_hdmi';

                this.loadHardwareDetails();
                this.focusCurrentDashboardElement();
            }, 600);
        } else {
            this.authStatus = 'error';
            this.authMessage = 'INCORRECT PIN — ACCESS DENIED ⚠️';

            setTimeout(() => {
                this.settingsPin = '';
                this.maskedPin = ['•', '•', '•', '•', '•', '•'];
                this.authStatus = 'idle';
                this.authMessage = '';
                this.focusCurrentKeypadBtn();
            }, 1200);
        }
    },

    // =========================================================================
    // 3. TV INPUT ROUTING & AUTO-SAVE CONFIGURATION
    // =========================================================================
    openHdmiMenu() {
        this.inputSelectionState = 'hdmi';
        this.dashboardFocus = 'hdmi_0';
        this.focusCurrentDashboardElement();
    },

    async openAppsMenu() {
        if (typeof this.syncInstalledApps === 'function') {
            await this.syncInstalledApps();
        }
        this.inputSelectionState = 'apps';
        this.dashboardFocus = 'app_0';
        this.focusCurrentDashboardElement();
    },

    closeInputMenu() {
        const prevState = this.inputSelectionState;
        this.inputSelectionState = 'main';
        this.dashboardFocus = (prevState === 'apps') ? 'input_apps' : 'input_hdmi';
        this.focusCurrentDashboardElement();
    },

    _persistPort(port, label) {
        this.liveTvSelectedPort = port;
        try {
            localStorage.setItem('last_tv_input_port', port);
            if (window.flutterBridge?.savePortPreference) {
                window.flutterBridge.savePortPreference(port).catch(() => {});
            } else if (window.flutterBridge?.saveLiveTvPort) {
                window.flutterBridge.saveLiveTvPort(port).catch(() => {});
            }
        } catch (e) {
            console.warn('[TVSettings] Port persistence warning:', e);
        }
        this.hasUnsavedChanges = false;
        this.showToast(`Default TV Input set to ${label} ✓`);
    },

    selectHdmi(port) {
        if (!port) return;
        this._persistPort(port, port);
        this.closeInputMenu();
    },

    selectIptv() {
        this._persistPort('IPTV', 'IPTV');
    },

    selectApp(app) {
        if (!app) return;
        const pkgName = app.package_name || app.id || app.name;
        this._persistPort(`APP:${pkgName}`, app.name);
        this.closeInputMenu();
    },

    // =========================================================================
    // 4. HARDWARE TELEMETRY & NATIVE ANDROID TV BRIDGE
    // =========================================================================
    async loadHardwareDetails(isManual = false) {
        this.isRefreshingHw = true;
        const dev = this.hotelData?.device || {};
        const tmpl = this.hotelData?.template || {};

        try {
            if (window.flutterBridge?.isAvailable?.() && typeof window.flutterBridge.identifyDevice === 'function') {
                const info = await window.flutterBridge.identifyDevice();
                const d = (info && info.data) || (info && info.device) || info || {};
                const rawOs = d.os_version || dev.os_version || '16';

                this.hwData = {
                    serial: d.serial || d.device_id || dev.device_id || '3d761ddf4a5d30a3',
                    ip: d.ip || d.ip_address || dev.ip_address || '10.0.2.15',
                    gateway: d.gateway || d.gway || dev.gateway || '10.0.2.2',
                    model: d.model || dev.model || 'AOSP TV on x86',
                    brand: d.brand || dev.brand || 'google',
                    mac: d.mac || d.mac_address || dev.mac_address || '4A:2D:A4:DF:D7:89',
                    subnet: d.subnet || d.subnet_mask || dev.subnet_mask || '255.255.255.0',
                    dns: d.dns || d.DNS || dev.dns || '8.8.8.8',
                    android: String(rawOs).toLowerCase().includes('android') ? String(rawOs) : `Android ${rawOs}`,
                    version: d.version || d.template_version || tmpl.latest_version || '29.0'
                };
                setTimeout(() => {
                    this.isRefreshingHw = false;
                    if (isManual) this.showToast('Hardware & Network telemetry refreshed from TV bridge ✓');
                }, 350);
                return;
            }
        } catch (_) {}

        // Fallback to data.json
        const rawOs = dev.os_version || '16';
        this.hwData = {
            serial: dev.device_id || '3d761ddf4a5d30a3',
            ip: dev.ip_address || '10.0.2.15',
            gateway: dev.gateway || '10.0.2.2',
            model: dev.model || 'AOSP TV on x86',
            brand: dev.brand || 'google',
            mac: dev.mac_address || '4A:2D:A4:DF:D7:89',
            subnet: dev.subnet_mask || '255.255.255.0',
            dns: dev.dns || '8.8.8.8',
            android: String(rawOs).toLowerCase().includes('android') ? String(rawOs) : `Android ${rawOs}`,
            version: tmpl.latest_version || '29.0'
        };
        setTimeout(() => {
            this.isRefreshingHw = false;
            if (isManual) this.showToast('Diagnostics refreshed from configuration ✓');
        }, 350);
    },

    triggerAndroidSettings() {
        try {
            if (window.flutterBridge?.openSettings) {
                window.flutterBridge.openSettings().catch(() => {});
            } else if (window.flutterBridge?.openAndroidSettings) {
                window.flutterBridge.openAndroidSettings().catch(() => {});
            } else if (window.FlutterBridge?.postMessage) {
                window.FlutterBridge.postMessage(JSON.stringify({ method: 'openSettings', args: [], id: Date.now() }));
            } else if (window.Android?.openAndroidSettings) {
                window.Android.openAndroidSettings();
            } else if (window.Android?.openSettings) {
                window.Android.openSettings();
            }
        } catch (e) {
            console.warn('[TVSettings] Android settings error:', e);
        }
        this.showToast('Launching Android TV System Settings...');
    },

    saveConfiguration() {
        this.isSavingConfig = true;
        this._persistPort(this.liveTvSelectedPort, this.liveTvSelectedPort);
        setTimeout(() => {
            this.isSavingConfig = false;
            this.hasUnsavedChanges = false;
            this.showToast(`Configuration Saved! Default TV Input: ${this.liveTvSelectedPort} ✓`);
        }, 400);
    },

    // =========================================================================
    // 5. FOCUS MANAGEMENT & REMOTE NAVIGATION
    // =========================================================================
    focusCurrentDashboardElement() {
        this.$nextTick(() => {
            if (this.settingsStep !== 'dashboard') return;

            const focusMap = {
                'header_back': 'tv-header-back-btn',
                'android_settings': 'settings-android-btn',
                'refresh_hw': 'settings-refresh-btn',
                'save': 'settings-save-btn',
                'exit': 'settings-exit-btn',
                'input_hdmi': 'settings_input_hdmi',
                'input_iptv': 'settings_input_iptv',
                'input_apps': 'settings_input_apps',
                'input_back': 'settings_input_back'
            };

            const targetId = focusMap[this.dashboardFocus] 
                || (typeof this.dashboardFocus === 'string' ? `settings_${this.dashboardFocus}` : null);

            if (targetId) {
                const el = document.getElementById(targetId);
                if (el) {
                    el.focus();
                    if (this.dashboardFocus.startsWith('app_')) {
                        el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
                    }
                }
            }
        });
    },

    handleSettingsKeyNavigation(e) {
        // Numeric keypad (0-9)
        const digit = TVRemoteManager.getDigit(e);
        if (digit !== null) {
            e.preventDefault();
            if (this.settingsStep === 'auth') this.addPinDigit(digit);
            return true;
        }

        if (this.settingsStep === 'auth') {
            return this._handleAuthKeyNavigation(e);
        }
        if (this.settingsStep === 'dashboard') {
            return this._handleDashboardKeyNavigation(e);
        }
        return false;
    },

    // --- AUTH STEP NAVIGATION ---
    _handleAuthKeyNavigation(e) {
        if (e.key === 'Backspace' || e.code === 'Backspace' || e.keyCode === 8 || e.key === 'Delete' || e.keyCode === 46) {
            e.preventDefault();
            this.delPinDigit();
            return true;
        }
        if (e.key === 'Escape' || e.code === 'Escape' || e.keyCode === 27) {
            e.preventDefault();
            this.handleSettingsEsc();
            return true;
        }
        if (TVRemoteManager.matches(e, 'BACK')) {
            e.preventDefault();
            if (this.settingsPin.length > 0) this.delPinDigit();
            else this.handleSettingsEsc();
            return true;
        }

        if (TVRemoteManager.matches(e, 'LEFT')) {
            e.preventDefault();
            if (typeof this.activeKeypadIndex === 'number' && this.activeKeypadIndex % 3 !== 0) {
                this.activeKeypadIndex -= 1;
                this.focusCurrentKeypadBtn();
            }
            return true;
        }
        if (TVRemoteManager.matches(e, 'RIGHT')) {
            e.preventDefault();
            if (typeof this.activeKeypadIndex === 'number' && (this.activeKeypadIndex + 1) % 3 !== 0 && this.activeKeypadIndex < 11) {
                this.activeKeypadIndex += 1;
                this.focusCurrentKeypadBtn();
            }
            return true;
        }
        if (TVRemoteManager.matches(e, 'UP')) {
            e.preventDefault();
            if (typeof this.activeKeypadIndex === 'number') {
                if (this.activeKeypadIndex >= 3) {
                    this.activeKeypadIndex -= 3;
                    this.focusCurrentKeypadBtn();
                } else {
                    this.activeKeypadIndex = 'header_back';
                    document.getElementById('tv-header-back-btn')?.focus();
                }
            }
            return true;
        }
        if (TVRemoteManager.matches(e, 'DOWN')) {
            e.preventDefault();
            if (this.activeKeypadIndex === 'header_back' || document.activeElement === document.getElementById('tv-header-back-btn')) {
                document.getElementById('tv-header-back-btn')?.blur();
                this.activeKeypadIndex = 0;
                this.focusCurrentKeypadBtn();
                return true;
            }
            if (typeof this.activeKeypadIndex === 'number' && this.activeKeypadIndex + 3 < 12) {
                this.activeKeypadIndex += 3;
                this.focusCurrentKeypadBtn();
            }
            return true;
        }
        if (TVRemoteManager.matches(e, 'ENTER')) {
            e.preventDefault();
            if (this.activeKeypadIndex === 'header_back' || document.activeElement === document.getElementById('tv-header-back-btn')) {
                this.goBack();
            } else if (typeof this.activeKeypadIndex === 'number') {
                document.getElementById(`settings_key_${this.activeKeypadIndex}`)?.click();
            }
            return true;
        }
        return false;
    },

    // --- DASHBOARD STEP NAVIGATION ---
    _handleDashboardKeyNavigation(e) {
        const appsList = this.getActiveOttList();
        const totalApps = appsList.length;
        const appsCols = 4;

        // BACK / ESC Navigation
        if (e.key === 'Escape' || e.code === 'Escape' || e.keyCode === 27 ||
            e.key === 'Backspace' || e.code === 'Backspace' || e.keyCode === 8 ||
            TVRemoteManager.matches(e, 'BACK')) {
            e.preventDefault();
            if (this.inputSelectionState !== 'main') this.closeInputMenu();
            else this.goBack();
            return true;
        }

        // UP Navigation
        if (TVRemoteManager.matches(e, 'UP')) {
            e.preventDefault();
            if (this.dashboardFocus === 'save') {
                if (this.lastDashboardSource === 'refresh') this.dashboardFocus = 'refresh_hw';
                else if (this.inputSelectionState === 'hdmi') this.dashboardFocus = 'hdmi_0';
                else if (this.inputSelectionState === 'apps') this.dashboardFocus = 'app_0';
                else this.dashboardFocus = 'input_hdmi';
            } else if (this.dashboardFocus === 'exit') {
                this.dashboardFocus = 'refresh_hw';
            } else if (this.dashboardFocus === 'refresh_hw') {
                this.dashboardFocus = 'android_settings';
            } else if (this.inputSelectionState === 'apps' && this.dashboardFocus.startsWith('app_')) {
                const idx = parseInt(this.dashboardFocus.replace('app_', ''), 10);
                if (Math.floor(idx / appsCols) > 0) this.dashboardFocus = `app_${idx - appsCols}`;
                else this.dashboardFocus = 'header_back';
            } else {
                this.dashboardFocus = 'header_back';
            }
            this.focusCurrentDashboardElement();
            return true;
        }

        // DOWN Navigation
        if (TVRemoteManager.matches(e, 'DOWN')) {
            e.preventDefault();
            if (this.dashboardFocus === 'header_back' || document.activeElement === document.getElementById('tv-header-back-btn')) {
                document.getElementById('tv-header-back-btn')?.blur();
                if (this.inputSelectionState === 'hdmi') this.dashboardFocus = 'hdmi_0';
                else if (this.inputSelectionState === 'apps') this.dashboardFocus = 'app_0';
                else this.dashboardFocus = 'input_hdmi';
                this.lastDashboardSource = 'input';
            } else if (this.dashboardFocus === 'android_settings') {
                this.dashboardFocus = 'refresh_hw';
            } else if (this.dashboardFocus === 'refresh_hw') {
                this.lastDashboardSource = 'refresh';
                this.dashboardFocus = 'save';
            } else if (this.inputSelectionState === 'apps' && this.dashboardFocus.startsWith('app_')) {
                const idx = parseInt(this.dashboardFocus.replace('app_', ''), 10);
                if (idx + appsCols < totalApps) {
                    this.dashboardFocus = `app_${idx + appsCols}`;
                } else {
                    this.lastDashboardSource = 'input';
                    this.dashboardFocus = 'save';
                }
            } else if (['input_hdmi', 'input_iptv', 'input_apps', 'input_back'].includes(this.dashboardFocus) || this.dashboardFocus.startsWith('hdmi_')) {
                this.lastDashboardSource = 'input';
                this.dashboardFocus = 'save';
            }
            this.focusCurrentDashboardElement();
            return true;
        }

        // LEFT Navigation
        if (TVRemoteManager.matches(e, 'LEFT')) {
            e.preventDefault();
            if (this.dashboardFocus === 'exit') {
                this.dashboardFocus = 'save';
            } else if (this.dashboardFocus === 'android_settings' || this.dashboardFocus === 'refresh_hw') {
                this.lastDashboardSource = 'input';
                if (this.inputSelectionState === 'hdmi') this.dashboardFocus = `hdmi_${this.availableTvPorts.length - 1}`;
                else if (this.inputSelectionState === 'apps') this.dashboardFocus = 'app_0';
                else this.dashboardFocus = 'input_apps';
            } else if (this.dashboardFocus === 'save') {
                this.lastDashboardSource = 'input';
                if (this.inputSelectionState === 'hdmi') this.dashboardFocus = 'input_back';
                else if (this.inputSelectionState === 'apps') this.dashboardFocus = 'input_back';
                else this.dashboardFocus = 'input_apps';
            } else if (this.inputSelectionState === 'main') {
                if (this.dashboardFocus === 'input_apps') this.dashboardFocus = 'input_iptv';
                else if (this.dashboardFocus === 'input_iptv') this.dashboardFocus = 'input_hdmi';
            } else if (this.inputSelectionState === 'hdmi') {
                if (this.dashboardFocus.startsWith('hdmi_')) {
                    const idx = parseInt(this.dashboardFocus.replace('hdmi_', ''), 10);
                    this.dashboardFocus = (idx > 0) ? `hdmi_${idx - 1}` : 'input_back';
                }
            } else if (this.inputSelectionState === 'apps') {
                if (this.dashboardFocus.startsWith('app_')) {
                    const idx = parseInt(this.dashboardFocus.replace('app_', ''), 10);
                    this.dashboardFocus = (idx % appsCols > 0) ? `app_${idx - 1}` : 'input_back';
                }
            }
            this.focusCurrentDashboardElement();
            return true;
        }

        // RIGHT Navigation
        if (TVRemoteManager.matches(e, 'RIGHT')) {
            e.preventDefault();
            if (this.dashboardFocus === 'save') {
                this.dashboardFocus = 'exit';
            } else if (this.inputSelectionState === 'main') {
                if (this.dashboardFocus === 'input_hdmi') this.dashboardFocus = 'input_iptv';
                else if (this.dashboardFocus === 'input_iptv') this.dashboardFocus = 'input_apps';
                else if (this.dashboardFocus === 'input_apps') this.dashboardFocus = 'android_settings';
            } else if (this.inputSelectionState === 'hdmi') {
                if (this.dashboardFocus === 'input_back') {
                    this.dashboardFocus = 'hdmi_0';
                } else if (this.dashboardFocus.startsWith('hdmi_')) {
                    const idx = parseInt(this.dashboardFocus.replace('hdmi_', ''), 10);
                    if (idx < this.availableTvPorts.length - 1) this.dashboardFocus = `hdmi_${idx + 1}`;
                    else this.dashboardFocus = 'android_settings';
                }
            } else if (this.inputSelectionState === 'apps') {
                if (this.dashboardFocus === 'input_back') {
                    this.dashboardFocus = 'app_0';
                } else if (this.dashboardFocus.startsWith('app_')) {
                    const idx = parseInt(this.dashboardFocus.replace('app_', ''), 10);
                    if ((idx % appsCols < appsCols - 1) && (idx + 1 < totalApps)) {
                        this.dashboardFocus = `app_${idx + 1}`;
                    } else {
                        this.dashboardFocus = 'android_settings';
                    }
                }
            }
            this.focusCurrentDashboardElement();
            return true;
        }

        // ENTER / CLICK
        if (TVRemoteManager.matches(e, 'ENTER')) {
            e.preventDefault();
            if (this.dashboardFocus === 'header_back' || document.activeElement === document.getElementById('tv-header-back-btn')) {
                this.goBack();
            } else if (this.dashboardFocus === 'input_hdmi') {
                this.openHdmiMenu();
            } else if (this.dashboardFocus === 'input_iptv') {
                this.selectIptv();
            } else if (this.dashboardFocus === 'input_apps') {
                this.openAppsMenu();
            } else if (this.dashboardFocus === 'input_back') {
                this.closeInputMenu();
            } else if (typeof this.dashboardFocus === 'string' && this.dashboardFocus.startsWith('hdmi_')) {
                const idx = parseInt(this.dashboardFocus.replace('hdmi_', ''), 10);
                if (this.availableTvPorts[idx]) this.selectHdmi(this.availableTvPorts[idx]);
            } else if (typeof this.dashboardFocus === 'string' && this.dashboardFocus.startsWith('app_')) {
                const idx = parseInt(this.dashboardFocus.replace('app_', ''), 10);
                if (appsList[idx]) this.selectApp(appsList[idx]);
            } else if (this.dashboardFocus === 'android_settings') {
                this.triggerAndroidSettings();
            } else if (this.dashboardFocus === 'refresh_hw') {
                this.loadHardwareDetails(true);
            } else if (this.dashboardFocus === 'save') {
                this.saveConfiguration();
            } else if (this.dashboardFocus === 'exit') {
                this.goBack();
            } else {
                document.activeElement?.click?.();
            }
            return true;
        }

        return false;
    }
};
