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
                if (data.room_no) {
                    this.castDeviceName = `Hotel TV (Room ${data.room_no})`;
                    return;
                }
            }
        } catch (e) {
            console.warn('[ScreenCast] Bridge identifyDevice fallback notice:', e);
        }

        // Fallback from loaded hotelData / data.json
        const dev = this.hotelData?.device || {};
        const hotelName = this.hotelData?.hotel?.hotel_name || 'Hotel TV';
        const room = this.roomNo || dev.room_no;
        if (room) {
            this.castDeviceName = `${hotelName} (Room ${room})`;
        } else if (dev.brand && dev.model) {
            const modelClean = dev.model.replace(/_/g, ' ');
            this.castDeviceName = `${dev.brand.toUpperCase()} ${modelClean}`;
        } else {
            this.castDeviceName = `${hotelName} - Smart TV`;
        }
    },

    getCastDeviceName() {
        if (this.castDeviceName) return this.castDeviceName;
        const dev = this.hotelData?.device || {};
        const hotelName = this.hotelData?.hotel?.hotel_name || 'Hotel TV';
        const room = this.roomNo || dev.room_no;
        if (room) return `${hotelName} (Room ${room})`;
        return `${hotelName} - Smart TV`;
    }
};
