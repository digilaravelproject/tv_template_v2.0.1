/**
 * Hotel Luxury TV Template v2.0.1 - Screen Cast Controller Module (screenCast.js)
 * Clean Architecture & Repository Pattern:
 * - Triggers native wireless screen mirroring via Native Flutter Bridge (window.flutterBridge.launchCast)
 * - Dynamically resolves TV target device name from hardware bridge (identifyDevice) or hotelData/data.json
 * - Manages Screen Cast view state and TV remote navigation
 */
'use strict';

window.TVScreenCastController = {
    screenCastHtml: '',
    castDeviceName: '',

    async openScreenCast() {
        try {
            await this.fetchCastDeviceInfo();
            if (window.flutterBridge?.launchCast) {
                window.flutterBridge.launchCast().catch(e => console.warn('[ScreenCast] Flutter launchCast notice:', e));
            } else if (window.FlutterBridge?.postMessage) {
                try {
                    window.FlutterBridge.postMessage(JSON.stringify({ method: 'launchCast', args: [], id: Date.now() }));
                } catch (postErr) {
                    console.warn('[ScreenCast] FlutterBridge postMessage error:', postErr);
                }
            }
        } catch (err) {
            console.error('[ScreenCast] Error in openScreenCast:', err);
        } finally {
            this.$nextTick(() => {
                try {
                    document.getElementById('tv-header-back-btn')?.focus();
                } catch (_) { }
            });
        }
    },

    async fetchCastDeviceInfo() {
        try {
            // ✅ PRIORITY: Flutter-injected tv_display_name (Device Name + Room No)
            const tvDisplayName =
                this.hotelData?.device?.tv_display_name ||
                this.hotelData?.device?.tvDisplayName ||
                this.hotelData?.device?.tv_name;

            if (tvDisplayName) {
                this.castDeviceName = String(tvDisplayName).trim();
                return;
            }

            // Fallback: sirf room number (purana behavior)
            const room = this.roomNo || this.hotelData?.device?.room_no;
            if (room) {
                this.castDeviceName = `Room ${room}`;
                return;
            }

            // Fallback: native bridge
            if (window.flutterBridge?.identifyDevice) {
                try {
                    let info = await window.flutterBridge.identifyDevice();
                    if (typeof info === 'string') {
                        try { info = JSON.parse(info); } catch (_) { }
                    }
                    const data = (info && (info.data || info.device || info)) || {};
                    const name = data.device_name || data.deviceName || data.name;
                    if (name) {
                        this.castDeviceName = String(name).trim();
                        return;
                    }
                } catch (bridgeErr) {
                    console.warn('[ScreenCast] Bridge identifyDevice notice:', bridgeErr);
                }
            }

            // Final fallback: brand & model
            const dev = this.hotelData?.device || {};
            if (dev.brand && dev.model) {
                this.castDeviceName = `${dev.brand} ${dev.model}`.trim();
            } else {
                this.castDeviceName = 'Hotel TV';
            }
        } catch (err) {
            console.error('[ScreenCast] Error in fetchCastDeviceInfo:', err);
            this.castDeviceName = this.roomNo ? `Room ${this.roomNo}` : 'Hotel TV';
        }
    },

    getCastDeviceName() {
        try {
            // ✅ PRIORITY: Flutter-injected tv_display_name
            const tvDisplayName =
                this.hotelData?.device?.tv_display_name ||
                this.hotelData?.device?.tvDisplayName ||
                this.hotelData?.device?.tv_name;

            if (tvDisplayName) return String(tvDisplayName).trim();

            // Fallback: already fetched castDeviceName
            if (this.castDeviceName) return this.castDeviceName;

            // Fallback: room number only
            const room = this.roomNo || this.hotelData?.device?.room_no;
            if (room) return `Room ${room}`;

            return 'Hotel TV';
        } catch (err) {
            console.error('[ScreenCast] Error in getCastDeviceName:', err);
            return this.castDeviceName || (this.roomNo ? `Room ${this.roomNo}` : 'Hotel TV');
        }
    }
};
