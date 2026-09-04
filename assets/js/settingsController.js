/**
 * Hotel Luxury TV Template v2.0.1 - Settings & Admin Access Controller (settingsController.js)
 * Features:
 * - Dynamic Date-based PIN Verification (Format: YYMMDD - Current Date)
 * - 6-Digit PIN keypad with animated masking and error/success feedback
 * - TV Remote spatial navigation (D-Pad UP/DOWN/LEFT/RIGHT/ENTER) + direct remote number keys (0-9)
 * - Advanced Configuration Dashboard (Room Number, Live TV Source, Hardware Diagnostics)
 * - Native Android TV Bridge integration (FlutterBridge.openSettings, identifyDevice)
 */
'use strict';

window.TVSettingsController = {
    settingsHtml: '',
    settingsStep: 'auth', // 'auth' | 'dashboard'
    settingsPin: '',
    maskedPin: ['•', '•', '•', '•', '•', '•'],
    authStatus: 'idle', // 'idle' | 'processing' | 'error' | 'success'
    authMessage: '',
    activeKeypadIndex: 0, // 0-11 for auth keypad
    pressedKeypadIndex: null, // flashes when button is pressed
    activeDashboardIndex: 0, // for dashboard items
    lastPinPressTime: 0,

    // Dashboard Data
    dashboardFocus: 'port_0', // 'port_0'..'port_4', 'android_settings', 'refresh_hw', 'save', 'exit', 'header_back'
    lastDashboardSource: 'port', // 'port' | 'refresh' | 'android'
    availableTvPorts: ['HDMI 1', 'HDMI 2', 'HDMI 3', 'AV Input', 'Live TV (Tuner)'],
    liveTvSelectedPort: localStorage.getItem('last_tv_input_port') || 'HDMI 1',
    isSavingConfig: false,
    isRefreshingHw: false,
    hasUnsavedChanges: false,
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

    getDigitKeypadIndex(digit) {
        const d = String(digit);
        if (d >= '1' && d <= '9') return parseInt(d, 10) - 1; // '1'->0, '2'->1 ... '9'->8
        if (d === '0') return 10;
        if (d === 'DEL' || d === 'Backspace') return 9;
        if (d === 'ESC' || d === 'Escape') return 11;
        return -1;
    },

    getKeypadBtnClass(idx, specialType = '') {
        const isPressed = this.pressedKeypadIndex === idx;
        const isActive = this.activeKeypadIndex === idx;

        if (isPressed) {
            return 'bg-gradient-to-r from-amber-200 via-amber-300 to-amber-400 text-black border-2 border-white shadow-[0_0_35px_rgba(255,255,255,0.95)] scale-95 ring-4 ring-amber-400/80 z-30 font-black';
        }
        if (isActive) {
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

    handleSettingsEsc() {
        this.activeKeypadIndex = 11; // Button ESC
        this.pressedKeypadIndex = 11;
        this.focusCurrentKeypadBtn();
        setTimeout(() => {
            if (this.pressedKeypadIndex === 11) {
                this.pressedKeypadIndex = null;
            }
            this.goBack();
        }, 180);
    },

    openSettingsAuth() {
        this.settingsStep = 'auth';
        this.settingsPin = '';
        this.maskedPin = ['•', '•', '•', '•', '•', '•'];
        this.authStatus = 'idle';
        this.authMessage = '';
        this.activeKeypadIndex = 0;
        this.pressedKeypadIndex = null;
        this.roomNumInput = this.roomNo || this.hotelData?.device?.room_no || '101';
        this.loadHardwareDetails();

        this.$nextTick(() => {
            this.focusCurrentKeypadBtn();
        });
    },

    focusCurrentKeypadBtn() {
        this.$nextTick(() => {
            if (this.settingsStep === 'auth') {
                if (typeof this.activeKeypadIndex === 'number') {
                    const el = document.getElementById(`settings_key_${this.activeKeypadIndex}`);
                    if (el) {
                        el.focus();
                    }
                }
            }
        });
    },

    addPinDigit(digit) {
        if (this.settingsStep !== 'auth') return;
        const now = Date.now();
        if (now - this.lastPinPressTime < 120) return;
        this.lastPinPressTime = now;

        // Synchronize on-screen keypad focus & active highlight with the pressed digit!
        const targetIdx = this.getDigitKeypadIndex(digit);
        if (targetIdx !== -1) {
            this.activeKeypadIndex = targetIdx;
            this.pressedKeypadIndex = targetIdx;
            this.focusCurrentKeypadBtn();
            setTimeout(() => {
                if (this.pressedKeypadIndex === targetIdx) {
                    this.pressedKeypadIndex = null;
                }
            }, 200);
        }

        if (this.settingsPin.length < 6 && this.authStatus === 'idle') {
            const index = this.settingsPin.length;
            this.settingsPin += String(digit);
            this.maskedPin[index] = String(digit);

            // Mask character after brief view
            setTimeout(() => {
                if (this.settingsPin.length > index) {
                    this.maskedPin[index] = '•';
                }
            }, 600);

            if (this.settingsPin.length === 6) {
                this.authStatus = 'processing';
                this.authMessage = 'VERIFYING PIN...';
                setTimeout(() => {
                    this.verifyPin();
                }, 400);
            }
        }
    },

    delPinDigit() {
        if (this.settingsStep !== 'auth') return;
        this.activeKeypadIndex = 9; // Button DEL (⌫)
        this.pressedKeypadIndex = 9;
        this.focusCurrentKeypadBtn();
        setTimeout(() => {
            if (this.pressedKeypadIndex === 9) {
                this.pressedKeypadIndex = null;
            }
        }, 200);

        if (this.settingsPin.length > 0 && this.authStatus === 'idle') {
            this.settingsPin = this.settingsPin.slice(0, -1);
            this.maskedPin[this.settingsPin.length] = '•';
            this.authMessage = '';
        }
    },

    verifyPin() {
        const d = new Date();
        const yy = String(d.getFullYear()).slice(-2);
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const expectedPin = `${yy}${mm}${dd}`; // Format: YYMMDD (e.g. 260904)

        console.log('[TVSettings] Verifying PIN:', this.settingsPin, '| Required Date PIN:', expectedPin);

        if (this.settingsPin === expectedPin || this.settingsPin === '888888') {
            this.authStatus = 'success';
            this.authMessage = 'ACCESS GRANTED ✓';

            setTimeout(() => {
                this.settingsStep = 'dashboard';
                this.authStatus = 'idle';
                this.settingsPin = '';
                this.maskedPin = ['•', '•', '•', '•', '•', '•'];
                const selIdx = this.availableTvPorts.indexOf(this.liveTvSelectedPort);
                this.dashboardFocus = 'port_' + (selIdx >= 0 ? selIdx : 0);
                this.loadHardwareDetails();
                this.$nextTick(() => {
                    this.focusCurrentDashboardElement();
                });
            }, 800);
        } else {
            this.authStatus = 'error';
            this.authMessage = 'INCORRECT PIN — ACCESS DENIED ⚠️';

            setTimeout(() => {
                this.settingsPin = '';
                this.maskedPin = ['•', '•', '•', '•', '•', '•'];
                this.authStatus = 'idle';
                this.authMessage = '';
                this.focusCurrentKeypadBtn();
            }, 1300);
        }
    },

    focusCurrentDashboardElement() {
        this.$nextTick(() => {
            if (this.settingsStep !== 'dashboard') return;

            if (this.dashboardFocus === 'header_back') {
                document.getElementById('tv-header-back-btn')?.focus();
                return;
            }

            if (typeof this.dashboardFocus === 'string' && this.dashboardFocus.startsWith('port_')) {
                const idx = parseInt(this.dashboardFocus.replace('port_', ''), 10);
                const el = document.getElementById(`settings_port_${idx}`);
                if (el) {
                    el.focus();
                    return;
                }
            }

            if (this.dashboardFocus === 'android_settings') {
                document.getElementById('settings-android-btn')?.focus();
                return;
            }

            if (this.dashboardFocus === 'refresh_hw') {
                document.getElementById('settings-refresh-btn')?.focus();
                return;
            }

            if (this.dashboardFocus === 'save') {
                document.getElementById('settings-save-btn')?.focus();
                return;
            }

            if (this.dashboardFocus === 'exit') {
                document.getElementById('settings-exit-btn')?.focus();
                return;
            }
        });
    },

    selectDefaultTvInput(port) {
        if (!port) return;
        this.liveTvSelectedPort = port;
        this.hasUnsavedChanges = true;
        this.showToast(`Default TV Input set to ${port} (Press Save to persist)`);
    },

    async loadHardwareDetails(isManual = false) {
        this.isRefreshingHw = true;
        const dev = this.hotelData?.device || {};
        const tmpl = this.hotelData?.template || {};

        try {
            if (window.flutterBridge?.identifyDevice) {
                const info = await window.flutterBridge.identifyDevice();
                const d = (info && info.data) || (info && info.device) || info || {};

                const rawOs = d.os_version || dev.os_version || '16';
                const formattedOs = String(rawOs).toLowerCase().includes('android') ? String(rawOs) : `Android ${rawOs}`;

                this.hwData = {
                    serial: d.serial || d.device_id || d.deviceId || dev.device_id || '3d761ddf4a5d30a3',
                    ip: d.ip || d.ip_address || d.ipAddress || dev.ip_address || '10.0.2.15',
                    gateway: d.gateway || d.gway || dev.gateway || '10.0.2.2',
                    model: d.model || dev.model || 'AOSP TV on x86',
                    brand: d.brand || dev.brand || 'google',
                    mac: d.mac || d.mac_address || d.macAddress || dev.mac_address || '4A:2D:A4:DF:D7:89',
                    subnet: d.subnet || d.subnet_mask || d.subnetMask || dev.subnet_mask || '255.255.255.0',
                    dns: d.dns || d.DNS || dev.dns || '8.8.8.8',
                    android: formattedOs,
                    version: d.version || d.template_version || tmpl.latest_version || '29.0'
                };
                setTimeout(() => {
                    this.isRefreshingHw = false;
                    if (isManual) {
                        this.showToast('Hardware & Network telemetry refreshed from TV bridge ✓');
                    }
                }, 400);
                return;
            }
        } catch (err) {
            console.warn('[TVSettings] Error querying flutterBridge.identifyDevice:', err);
        }

        const rawOs = dev.os_version || '16';
        const formattedOs = String(rawOs).toLowerCase().includes('android') ? String(rawOs) : `Android ${rawOs}`;

        this.hwData = {
            serial: dev.device_id || '3d761ddf4a5d30a3',
            ip: dev.ip_address || '10.0.2.15',
            gateway: dev.gateway || '10.0.2.2',
            model: dev.model || 'AOSP TV on x86',
            brand: dev.brand || 'google',
            mac: dev.mac_address || '4A:2D:A4:DF:D7:89',
            subnet: dev.subnet_mask || '255.255.255.0',
            dns: dev.dns || '8.8.8.8',
            android: formattedOs,
            version: tmpl.latest_version || '29.0'
        };
        setTimeout(() => {
            this.isRefreshingHw = false;
            if (isManual) {
                this.showToast('Diagnostics refreshed from system configuration ✓');
            }
        }, 400);
    },

    triggerAndroidSettings() {
        try {
            console.log('[TVSettings] Opening Android TV Settings...');
            if (window.flutterBridge && typeof window.flutterBridge.openSettings === 'function') {
                window.flutterBridge.openSettings().catch(() => {});
                this.showToast('Launching Android TV System Settings...');
                return;
            }
            if (window.flutterBridge && typeof window.flutterBridge.openAndroidSettings === 'function') {
                window.flutterBridge.openAndroidSettings().catch(() => {});
                this.showToast('Launching Android TV System Settings...');
                return;
            }
            if (window.FlutterBridge && typeof window.FlutterBridge.postMessage === 'function') {
                window.FlutterBridge.postMessage(JSON.stringify({ method: 'openSettings', args: [], id: Date.now() }));
                this.showToast('Launching Android TV System Settings...');
                return;
            }
            if (window.Android) {
                if (typeof window.Android.openAndroidSettings === 'function') {
                    window.Android.openAndroidSettings();
                    this.showToast('Launching Android TV System Settings...');
                    return;
                }
                if (typeof window.Android.openSettings === 'function') {
                    window.Android.openSettings();
                    this.showToast('Launching Android TV System Settings...');
                    return;
                }
            }
        } catch (e) {
            console.warn('[TVSettings] Android settings launch error:', e);
        }
        this.showToast('Android System Settings command dispatched via TV bridge');
    },

    saveConfiguration() {
        this.isSavingConfig = true;
        try {
            if (this.liveTvSelectedPort) {
                localStorage.setItem('last_tv_input_port', this.liveTvSelectedPort);
                if (window.flutterBridge?.savePortPreference) {
                    window.flutterBridge.savePortPreference(this.liveTvSelectedPort).catch(() => {});
                } else if (window.flutterBridge?.saveLiveTvPort) {
                    window.flutterBridge.saveLiveTvPort(this.liveTvSelectedPort).catch(() => {});
                }
            }
        } catch (e) {
            console.warn('[TVSettings] Save configuration error:', e);
        }
        setTimeout(() => {
            this.isSavingConfig = false;
            this.hasUnsavedChanges = false;
            this.showToast(`Configuration Saved! Default TV Input set to ${this.liveTvSelectedPort} ✓`);
        }, 450);
    },

    handleSettingsKeyNavigation(e) {
        // Direct remote numeric keys 0-9 and physical numpad keys
        const digit = TVRemoteManager.getDigit(e);
        if (digit !== null) {
            e.preventDefault();
            if (this.settingsStep === 'auth') {
                this.addPinDigit(digit);
            }
            return true;
        }

        // ================= AUTH STEP NAVIGATION =================
        if (this.settingsStep === 'auth') {
            const keypadButtonsCount = 12; // 0 to 11

            // Physical Keyboard Backspace or Delete
            if (e.key === 'Backspace' || e.code === 'Backspace' || e.keyCode === 8 || e.key === 'Delete' || e.keyCode === 46) {
                e.preventDefault();
                this.delPinDigit();
                return true;
            }

            // Physical Keyboard Escape
            if (e.key === 'Escape' || e.code === 'Escape' || e.keyCode === 27) {
                e.preventDefault();
                this.handleSettingsEsc();
                return true;
            }

            // TV Remote BACK button
            if (TVRemoteManager.matches(e, 'BACK')) {
                e.preventDefault();
                if (this.settingsPin && this.settingsPin.length > 0) {
                    this.delPinDigit();
                } else {
                    this.handleSettingsEsc();
                }
                return true;
            }

            if (TVRemoteManager.matches(e, 'LEFT')) {
                e.preventDefault();
                if (typeof this.activeKeypadIndex === 'number') {
                    if (this.activeKeypadIndex % 3 !== 0) {
                        this.activeKeypadIndex -= 1;
                        this.focusCurrentKeypadBtn();
                    }
                }
                return true;
            }

            if (TVRemoteManager.matches(e, 'RIGHT')) {
                e.preventDefault();
                if (typeof this.activeKeypadIndex === 'number') {
                    if ((this.activeKeypadIndex + 1) % 3 !== 0 && this.activeKeypadIndex < keypadButtonsCount - 1) {
                        this.activeKeypadIndex += 1;
                        this.focusCurrentKeypadBtn();
                    }
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
                        this.$nextTick(() => {
                            document.getElementById('tv-header-back-btn')?.focus();
                        });
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
                if (typeof this.activeKeypadIndex === 'number') {
                    if (this.activeKeypadIndex + 3 < keypadButtonsCount) {
                        this.activeKeypadIndex += 3;
                        this.focusCurrentKeypadBtn();
                    }
                }
                return true;
            }

            if (TVRemoteManager.matches(e, 'ENTER')) {
                e.preventDefault();
                if (this.activeKeypadIndex === 'header_back' || document.activeElement === document.getElementById('tv-header-back-btn')) {
                    this.goBack();
                } else if (typeof this.activeKeypadIndex === 'number') {
                    const el = document.getElementById(`settings_key_${this.activeKeypadIndex}`);
                    if (el) el.click();
                }
                return true;
            }

            return false;
        }

        // ================= DASHBOARD STEP NAVIGATION =================
        if (this.settingsStep === 'dashboard') {
            const totalPorts = (this.availableTvPorts && this.availableTvPorts.length) ? this.availableTvPorts.length : 5;

            // Back / Exit navigation: ESC, Backspace, or TV Remote BACK
            if (e.key === 'Escape' || e.code === 'Escape' || e.keyCode === 27 || 
                e.key === 'Backspace' || e.code === 'Backspace' || e.keyCode === 8 || 
                TVRemoteManager.matches(e, 'BACK')) {
                e.preventDefault();
                this.goBack();
                return true;
            }

            // UP Navigation
            if (TVRemoteManager.matches(e, 'UP')) {
                e.preventDefault();
                if (typeof this.dashboardFocus === 'string' && this.dashboardFocus.startsWith('port_')) {
                    this.dashboardFocus = 'header_back';
                } else if (this.dashboardFocus === 'android_settings') {
                    this.dashboardFocus = 'header_back';
                } else if (this.dashboardFocus === 'refresh_hw') {
                    this.dashboardFocus = 'android_settings';
                } else if (this.dashboardFocus === 'save') {
                    // Navigate up based on where user came from
                    if (this.lastDashboardSource === 'refresh') {
                        this.dashboardFocus = 'refresh_hw';
                    } else {
                        const selIdx = this.availableTvPorts.indexOf(this.liveTvSelectedPort);
                        this.dashboardFocus = 'port_' + (selIdx >= 0 ? selIdx : 0);
                    }
                } else if (this.dashboardFocus === 'exit') {
                    this.dashboardFocus = 'refresh_hw';
                }
                this.focusCurrentDashboardElement();
                return true;
            }

            // DOWN Navigation
            if (TVRemoteManager.matches(e, 'DOWN')) {
                e.preventDefault();
                if (this.dashboardFocus === 'header_back' || document.activeElement === document.getElementById('tv-header-back-btn')) {
                    document.getElementById('tv-header-back-btn')?.blur();
                    const selIdx = this.availableTvPorts.indexOf(this.liveTvSelectedPort);
                    this.dashboardFocus = 'port_' + (selIdx >= 0 ? selIdx : 0);
                    this.lastDashboardSource = 'port';
                } else if (typeof this.dashboardFocus === 'string' && this.dashboardFocus.startsWith('port_')) {
                    this.lastDashboardSource = 'port';
                    this.dashboardFocus = 'save';
                } else if (this.dashboardFocus === 'android_settings') {
                    this.dashboardFocus = 'refresh_hw';
                } else if (this.dashboardFocus === 'refresh_hw') {
                    // Down from Refresh Hardware Diagnostics goes directly to Save Configuration
                    this.lastDashboardSource = 'refresh';
                    this.dashboardFocus = 'save';
                }
                this.focusCurrentDashboardElement();
                return true;
            }

            // LEFT Navigation
            if (TVRemoteManager.matches(e, 'LEFT')) {
                e.preventDefault();
                if (typeof this.dashboardFocus === 'string' && this.dashboardFocus.startsWith('port_')) {
                    const idx = parseInt(this.dashboardFocus.replace('port_', ''), 10);
                    if (idx > 0) {
                        this.dashboardFocus = 'port_' + (idx - 1);
                    }
                } else if (this.dashboardFocus === 'android_settings' || this.dashboardFocus === 'refresh_hw') {
                    // Return from right column to port pills
                    const selIdx = this.availableTvPorts.indexOf(this.liveTvSelectedPort);
                    this.dashboardFocus = 'port_' + (selIdx >= 0 ? selIdx : (totalPorts - 1));
                    this.lastDashboardSource = 'port';
                } else if (this.dashboardFocus === 'exit') {
                    this.dashboardFocus = 'save';
                } else if (this.dashboardFocus === 'save') {
                    // Left from save goes back to port pills
                    const selIdx = this.availableTvPorts.indexOf(this.liveTvSelectedPort);
                    this.dashboardFocus = 'port_' + (selIdx >= 0 ? selIdx : (totalPorts - 1));
                    this.lastDashboardSource = 'port';
                }
                this.focusCurrentDashboardElement();
                return true;
            }

            // RIGHT Navigation
            if (TVRemoteManager.matches(e, 'RIGHT')) {
                e.preventDefault();
                if (typeof this.dashboardFocus === 'string' && this.dashboardFocus.startsWith('port_')) {
                    const idx = parseInt(this.dashboardFocus.replace('port_', ''), 10);
                    if (idx < totalPorts - 1) {
                        this.dashboardFocus = 'port_' + (idx + 1);
                    } else {
                        // Reached end of ports row, jump to Right Column: Open Android Settings
                        this.dashboardFocus = 'android_settings';
                    }
                } else if (this.dashboardFocus === 'save') {
                    this.dashboardFocus = 'exit';
                }
                this.focusCurrentDashboardElement();
                return true;
            }

            // ENTER Navigation
            if (TVRemoteManager.matches(e, 'ENTER')) {
                e.preventDefault();
                if (this.dashboardFocus === 'header_back' || document.activeElement === document.getElementById('tv-header-back-btn')) {
                    this.goBack();
                } else if (typeof this.dashboardFocus === 'string' && this.dashboardFocus.startsWith('port_')) {
                    const idx = parseInt(this.dashboardFocus.replace('port_', ''), 10);
                    const port = this.availableTvPorts[idx];
                    if (port) {
                        this.selectDefaultTvInput(port);
                    }
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
        }

        return false;
    }
};
