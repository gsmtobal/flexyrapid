(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
        typeof define === 'function' && define.amd ? define(factory) :
            (global = global || self, global.VueCountly = factory());
}(this, function () {
    'use strict';

    function VueCountly(Vue, Countly, options) {
        Object.defineProperty(Vue, 'Countly', {
            value: Countly
        });
        Object.defineProperty(Vue.prototype, '$Countly', {
            value: Countly
        });
        Countly.init(options);
    }

    return VueCountly;

}));