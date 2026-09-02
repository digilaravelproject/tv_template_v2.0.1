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
        this.fetchCastDeviceInfo();
        if (window.flutterBridge?.launchCast) {
            window.flutterBridge.launchCast().catch(e => console.warn('[TV] Flutter launchCast notice:', e));
        } else if (window.FlutterBridge?.postMessage) {
            try {
                window.FlutterBridge.postMessage(JSON.stringify({ method: 'launchCast', args: [], id: Date.now() }));
            } catch (_) {}
        }
        this.$nextTick(() => {
            document.getElementById('tv-header-back-btn')?.focus();
        });
    },

    async fetchCastDeviceInfo() {
        // 1. Direct Room Number Priority (e.g. "Room 1111")
        const room = this.roomNo || this.hotelData?.device?.room_no;
        if (room) {
            this.castDeviceName = `Room ${room}`;
            return;
        }

        // 2. Fallback to native bridge if no room number
        try {
            if (window.flutterBridge?.identifyDevice) {
                let info = await window.flutterBridge.identifyDevice();
                if (typeof info === 'string') {
                    try { info = JSON.parse(info); } catch (_) {}
                }
                const data = (info && (info.data || info.device || info)) || {};
                const name = data.device_name || data.deviceName || data.name;
                if (name) {
                    this.castDeviceName = name;
                    return;
                }
            }
        } catch (e) {
            console.warn('[ScreenCast] Bridge identifyDevice fallback notice:', e);
        }

        // 3. Fallback to device brand & model
        const dev = this.hotelData?.device || {};
        if (dev.brand && dev.model) {
            this.castDeviceName = `${dev.brand.toUpperCase()} ${dev.model.replace(/_/g, ' ')}`;
        } else {
            this.castDeviceName = 'Hotel TV';
        }
    },

    getCastDeviceName() {
        const room = this.roomNo || this.hotelData?.device?.room_no;
        if (room) return `Room ${room}`;
        if (this.castDeviceName) return this.castDeviceName;
        return 'Hotel TV';
    }
};
