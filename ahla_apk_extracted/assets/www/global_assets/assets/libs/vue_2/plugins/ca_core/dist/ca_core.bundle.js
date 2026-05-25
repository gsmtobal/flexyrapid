(function webpackUniversalModuleDefinition(root, factory) {
	if(typeof exports === 'object' && typeof module === 'object')
		module.exports = factory(require("Vuex"), require("VueI18n"), require("Vue"), require("axios"));
	else if(typeof define === 'function' && define.amd)
		define(["Vuex", "VueI18n", "Vue", "axios"], factory);
	else if(typeof exports === 'object')
		exports["ca_core"] = factory(require("Vuex"), require("VueI18n"), require("Vue"), require("axios"));
	else
		root["ca_core"] = factory(root["Vuex"], root["VueI18n"], root["Vue"], root["axios"]);
})(window, function(__WEBPACK_EXTERNAL_MODULE__1__, __WEBPACK_EXTERNAL_MODULE__2__, __WEBPACK_EXTERNAL_MODULE__3__, __WEBPACK_EXTERNAL_MODULE__4__) {
return /******/ (function(modules) { // webpackBootstrap
/******/ 	// The module cache
/******/ 	var installedModules = {};
/******/
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/
/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId]) {
/******/ 			return installedModules[moduleId].exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			i: moduleId,
/******/ 			l: false,
/******/ 			exports: {}
/******/ 		};
/******/
/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/
/******/ 		// Flag the module as loaded
/******/ 		module.l = true;
/******/
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/
/******/
/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = modules;
/******/
/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = installedModules;
/******/
/******/ 	// define getter function for harmony exports
/******/ 	__webpack_require__.d = function(exports, name, getter) {
/******/ 		if(!__webpack_require__.o(exports, name)) {
/******/ 			Object.defineProperty(exports, name, { enumerable: true, get: getter });
/******/ 		}
/******/ 	};
/******/
/******/ 	// define __esModule on exports
/******/ 	__webpack_require__.r = function(exports) {
/******/ 		if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 			Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 		}
/******/ 		Object.defineProperty(exports, '__esModule', { value: true });
/******/ 	};
/******/
/******/ 	// create a fake namespace object
/******/ 	// mode & 1: value is a module id, require it
/******/ 	// mode & 2: merge all properties of value into the ns
/******/ 	// mode & 4: return value when already ns object
/******/ 	// mode & 8|1: behave like require
/******/ 	__webpack_require__.t = function(value, mode) {
/******/ 		if(mode & 1) value = __webpack_require__(value);
/******/ 		if(mode & 8) return value;
/******/ 		if((mode & 4) && typeof value === 'object' && value && value.__esModule) return value;
/******/ 		var ns = Object.create(null);
/******/ 		__webpack_require__.r(ns);
/******/ 		Object.defineProperty(ns, 'default', { enumerable: true, value: value });
/******/ 		if(mode & 2 && typeof value != 'string') for(var key in value) __webpack_require__.d(ns, key, function(key) { return value[key]; }.bind(null, key));
/******/ 		return ns;
/******/ 	};
/******/
/******/ 	// getDefaultExport function for compatibility with non-harmony modules
/******/ 	__webpack_require__.n = function(module) {
/******/ 		var getter = module && module.__esModule ?
/******/ 			function getDefault() { return module['default']; } :
/******/ 			function getModuleExports() { return module; };
/******/ 		__webpack_require__.d(getter, 'a', getter);
/******/ 		return getter;
/******/ 	};
/******/
/******/ 	// Object.prototype.hasOwnProperty.call
/******/ 	__webpack_require__.o = function(object, property) { return Object.prototype.hasOwnProperty.call(object, property); };
/******/
/******/ 	// __webpack_public_path__
/******/ 	__webpack_require__.p = "/root/mladen/projects/frameworks/production/vue_2/engine/core/1.0.9/dist";
/******/
/******/
/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(__webpack_require__.s = 5);
/******/ })
/************************************************************************/
/******/ ([
/* 0 */
/***/ (function(module) {

module.exports = JSON.parse("{\"version\":\"1.0.9\",\"name\":\"ca_core\",\"framework\":\"vue_2\",\"type\":\"plugin\",\"title\":\"CA CORE\",\"description\":\"\",\"documentation_link\":\"\",\"icon\":\"oc-puzzle\",\"libs\":{\"head\":{\"js\":[{\"url\":\"/assets/libs/vue_2/plugins/ca_core/dist/ca_core.bundle.js\"}],\"styles\":[]},\"body\":{\"js\":[]}}}");

/***/ }),
/* 1 */
/***/ (function(module, exports) {

module.exports = __WEBPACK_EXTERNAL_MODULE__1__;

/***/ }),
/* 2 */
/***/ (function(module, exports) {

module.exports = __WEBPACK_EXTERNAL_MODULE__2__;

/***/ }),
/* 3 */
/***/ (function(module, exports) {

module.exports = __WEBPACK_EXTERNAL_MODULE__3__;

/***/ }),
/* 4 */
/***/ (function(module, exports) {

module.exports = __WEBPACK_EXTERNAL_MODULE__4__;

/***/ }),
/* 5 */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
// ESM COMPAT FLAG
__webpack_require__.r(__webpack_exports__);

// EXPORTS
__webpack_require__.d(__webpack_exports__, "install", function() { return /* binding */ core_install; });

// EXTERNAL MODULE: external "Vuex"
var external_Vuex_ = __webpack_require__(1);

// EXTERNAL MODULE: ./vue_2/engine/core/configs/configs.json
var configs_configs = __webpack_require__(0);

// CONCATENATED MODULE: ./vue_2/engine/core/store/modules/auth.js
/* harmony default export */ var auth = ({
  state: {
    authenticated: false,
    user: ""
  },
  getters: {
    authenticated: function authenticated(state) {
      return state.authenticated;
    },
    user: function user(state) {
      return state.user;
    }
  },
  mutations: {
    AUTHENTICATE: function AUTHENTICATE(state, status) {
      // Vue.set(state, 'authenticated', !!status);
      state.authenticated = !!status;
    },
    LOGOUT: function LOGOUT(state) {
      state.authenticated = false;
    },
    USER: function USER(state, userInfo) {
      state.user = userInfo;
    }
  },
  action: {
    login: function login(_ref, status) {
      var commit = _ref.commit,
          dispatch = _ref.dispatch,
          getters = _ref.getters,
          rootGetters = _ref.rootGetters;
      // set local storage etc may return Promise
      return new Promise(function (resolve, reject) {
        commit('AUTHENTICATE', status);
        resolve();
      });
    }
  }
});
// CONCATENATED MODULE: ./vue_2/engine/core/utils/index.js
var CONSOLE_LOG = true;
function log() {
  var _console;

  if (CONSOLE_LOG) (_console = console).log.apply(_console, arguments);
}
;
/**
 * 
 * @param {*} Vue 
 * @param {*} options 
 */

function install(Vue, options) {
  Vue.prototype.$ca_log = log;
}
var utils_plugin = {
  // eslint-disable-next-line no-undef
  // name: PLUGIN_NAME,
  // version: VERSION,
  install: install,
  log: log
};
/* harmony default export */ var utils = (utils_plugin);
// CONCATENATED MODULE: ./vue_2/engine/core/store/stores.js


 // let plugin_info = {
// 	version: plugin_configs['version'],
// 	date: new Date().toLocaleDateString()
// }
// Documentation : https://vuex.vuejs.org/guide/state.html

/* harmony default export */ var stores = ({
  namespaced: true,
  state: {
    core_version: configs_configs["version"],
    configs: {},
    appComponent: ''
  },
  getters: {
    version: function version(state) {
      return state.version;
    },
    configs: function configs(state) {
      return state.configs;
    },
    configByName: function configByName(state) {
      return function (name) {
        return state.configs[name];
      };
    },
    appComponent: function appComponent(state) {
      return state.appComponent;
    }
  },

  /**
  * mutations have to be synchronous
  */
  mutations: {
    CONFIGS: function CONFIGS(state, payload) {
      state.configs = payload;
    },
    CONFIG_BY_NAME: function CONFIG_BY_NAME(state, _ref) {
      var name = _ref.name,
          value = _ref.value;
      state.configs[name] = value;
    },
    APP_COMPONENT: function APP_COMPONENT(state, payload) {
      state.appComponent = payload;
    }
  },

  /**
  * Actions are triggered with the store.dispatch method :  store.dispatch('userLogged', params)
  * !!!! mutations have to be synchronousActions don't have to be synchronous
  * store.dispatch can handle Promise returned by the triggered action
  */
  actions: {
    init: function init(context, _ref2) {
      var configs = _ref2.configs;
      log("storage init configs", configs);
      context.commit('CONFIGS', configs);
    }
  },
  modules: {
    auth: auth
  }
});
// CONCATENATED MODULE: ./vue_2/engine/core/store/index.js
function _extends() { _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; }; return _extends.apply(this, arguments); }



var StoreNamespace = 'core';
/**
 * 
 * @param {*} Vue 
 * @param {*} options 
 */

function store_install(Vue, options) {
  // Register global mixins
  Vue.mixin({
    methods: _extends({}, Object(external_Vuex_["mapMutations"])({
      authenticate: 'core/AUTHENTICATE' // map `this.add()` to `this.$store.commit('increment')`

    })),
    computed: _extends({}, Object(external_Vuex_["mapGetters"])({
      authenticated: 'core/authenticated'
    }))
  });
  /*
  Providing the store option to the root instance,
  the store will be injected into all child components of the root 
  and will be available on them as this.$store
  */
  // options['store'] = store;

  if (!options || !options.store) {
    throw new Error('ca_core:Please initialise plugin with a Vuex store.');
  }
  /**
   * Register modals vuex module:
   * 	example:  this.$store.getters['core/getSettings']
   */


  options.store.registerModule(StoreNamespace, stores); //	options.store.registerModule({ states, mutations, actions });
}
var store_plugin = {
  // eslint-disable-next-line no-undef
  // name: PLUGIN_NAME,
  // version: VERSION,
  install: store_install
};
/* harmony default export */ var store = (store_plugin); // /**
//  * Auto-install
//   */
// let GlobalVue = null;
// if (typeof window !== 'undefined') {
// 	GlobalVue = window.Vue
// } else if (typeof global !== 'undefined') {
// 	GlobalVue = global.Vue
// }
// if (GlobalVue) {
// 	GlobalVue.use(plugin)
// }
// CONCATENATED MODULE: ./vue_2/engine/core/apis/helpers/request.js
/**
 * 
 */
// import Utils from './utils';
var request = __webpack_require__(4)["default"];

/* harmony default export */ var helpers_request = (request);
// CONCATENATED MODULE: ./vue_2/engine/core/apis/helpers/index.js
/**
 * request uses axios:
 */


 // /**
//  * 
//  * @param {*} params 
//  */
// nextTick(callback, delay = 0) {
// 	callback = callback || function () { }
// 	//fix 'this' into 
// 	return Vue.nextTick.apply(this, [callback, delay])
// 	// return Vue.nextTick(callback, delay);
// }
// /**
//  * 
//  */

function useModule(ctx, instance, params) {
  log('useModule vue', arguments); //fix 'this' into 

  return Vue.use.apply(ctx || this, [instance, params]); // return Vue.use(instance, params);
}
/**
 * 
 * @param {*} callback 
 * @param {*} delay 
 */

function nextTick(callback, delay) {
  if (delay === void 0) {
    delay = 0;
  }

  callback = callback || function () {};

  return setTimeout(callback, delay);
} // /**
//  * 
//  * @param {*} instance 
//  * @param {*} params 
//  */
// export function useModule(instance, params) {
// 	log('useModule abstract', arguments)
// 	return (instance, params) => {
// 		log('error: not defined useModule.')
// 	}
// }

/**
 * 
 */

function createPromise() {
  var resolve, reject;
  var pPromise = new Promise(function (s, f) {
    resolve = s;
    reject = f;
  });
  pPromise.resolve = resolve;
  pPromise.reject = reject;
  return pPromise;
}
/**
 * 
 * @param {*} str 
 */

function isURL(str) {
  return /^(?:\w+:)?\/\/([^\s\.]+\.\S{2}|localhost[\:?\d]*)\S*$/.test(str);
}
/**
 * 
 * @param {*} index 
 * @param {*} param 
 */

function loadStyle(index, param) {
  log('loadStyle', arguments);
  var url = param.url || param;
  return new Promise(function (resolve, reject) {
    var link = document.createElement('link');
    link.id = "css_bundle_" + index + Date.now();
    link.type = 'text/css';
    link.rel = 'stylesheet';

    link.onload = function () {
      resolve();
      log('style has loaded');
    };

    link.href = url;
    var headScript = document.querySelector('script');
    headScript.parentNode.insertBefore(link, headScript); //NOTE: no way to detect css loaded

    resolve();
  });
}
/**
 * 
 * @param {*} index 
 * @param {*} param 
 */

function loadJs(index, param) {
  log('loadJs', arguments);
  var url = param.url || param;
  var instance = param.instance || ''; // umd global export name

  return new Promise(function (resolve, reject) {
    var element = document.createElement('script');
    element.id = "plugin_" + index + Date.now();
    element.async = true;
    element.addEventListener('load', function () {
      resolve(instance);
    });
    element.addEventListener('error', function () {
      reject(new Error("Error loading " + url));
    });
    element.src = url + "?v=" + Date.now();
    document.head.appendChild(element);
  });
}
/**
 * 		
 * @param {*} data  [{ url: str, instance },..]
 */

function loadPlugins(data) {
  window['ca'] = window['ca'] || {};
  var loadedPlugins = window.ca['loadedPlugins'] || {};
  var pluginsList = [];
  data = data || '';

  if (!Array.isArray(data) && data) {
    pluginsList.push({
      url: data
    });
  } else {
    pluginsList = data;
  }

  var pPromises = [];

  if (pluginsList.length) {
    for (var index = 0; index < pluginsList.length; index++) {
      var element = pluginsList[index];
      var url = element.url || element; // const name = (bundleUrl.split('/').reverse()[0].match(/^(.*?)\.[js|css]/)[1]);

      if (!loadedPlugins[url]) {
        var type = url.split('.').pop();
        log('loadedPlugin', type, url);
        loadedPlugins[url] = type == 'js' ? loadJs(index, element) : loadStyle(index, element);
      } //add existing status; promise.resolve(instance)


      pPromises.push(loadedPlugins[url]);
    }
  } // else { pPromises.push(Promise.resolve()) }


  return pPromises;
}
/**
 * 
 * @param {
		app_id,	rootEl,	mount_cb,
		assets: [{
			"instance": pageInstance,
			"url": pages_url + page + ".js"
		},
		{
			"url": pages_url + page + ".css"
		}]
	} params
 */

function loadAssets(params) {
  //load vue plugins:
  var plugins = params['assets'] || [];
  log('loadAssets', plugins);
  return Promise.all(loadPlugins(plugins)).then(function (pluginsInstances) {
    log('loadAssets pluginsInstances:', pluginsInstances);
    /** 
     * Install plugins
     * see https://dev.to/nkoik/writing-a-very-simple-plugin-in-vuejs---example-8g8
     */

    var pluginsStatus = [];
    var app_id = params['app_id'];

    for (var index = 0; index < pluginsInstances.length; index++) {
      /**
       * dummy try to orginize 'required' by order with nextTick
       */
      var pluginInstanceName = pluginsInstances[index] || '';

      if (pluginInstanceName) {
        log('loadAssets pluginInstanceName:', pluginInstanceName);
        pluginsStatus.push(Promise.resolve(pluginInstanceName));
      }
    }

    return Promise.all(pluginsStatus);
  })["catch"](function (error) {
    log('assets_synchronize fail', error);
  });
}
/**
 * 
 * @param {*} params 
 */

function helpers_loadFrameworks(params, options) {
  if (params === void 0) {
    params = {};
  }

  var frmStatus = [];

  if (params['frameworks']) {
    var _loop = function _loop(index) {
      var framework = params.frameworks[index];
      log('call loadFramework synchronize', framework);
      var server_url = options.server_url; // store.getters['configs']('server_url');

      var frmCfgUrl = isURL(framework.url) ? framework.url : server_url + framework.url;
      var status = helpers_request(frmCfgUrl + '/config.json').then(function (responce) {
        log('loadFramework', responce.data); //make url to server/framework/file

        var resources = responce.data['resources'] || [];

        for (var _index = 0; _index < resources.length; _index++) {
          if (resources[_index]['url']) resources[_index].url = isURL(resources[_index].url) ? resources[_index].url : frmCfgUrl + resources[_index].url;else resources[_index] = isURL(resources[_index]) ? resources[_index] : frmCfgUrl + resources[_index];
        }

        return loadAssets({
          assets: resources
        });
      })["catch"](function (err) {
        log('loadFramework fail', err);
      });
      frmStatus.push(status);
    };

    for (var index = 0; index < params.frameworks.length; index++) {
      _loop(index);
    }
  }

  return Promise.all(frmStatus);
}
/**
 * 
 * @param { server_url, app_id, name } params 
 */

function loadPage(params) {
  if (params === void 0) {
    params = {};
  }

  var app_id = params.app_id; //store.getters['configs']('app_id')

  var name = params && params.name || "main_page";
  var pageInstance = name;
  log("loadPage: page Instance:", app_id, pageInstance);
  /**
   * 
   * before download, check page component exists
   * done at $navigate: check route path exists 
   *  */

  log("TODO: before download, check page component exists.", params);
  return loadAssets({
    app_id: app_id,
    rootEl: "",
    mount_cb: "",
    assets: [{
      "instance": name,
      "url": params.url + "/" + name + ".bundle.js"
    }, {
      "url": params.url + "/" + name + ".bundle.css"
    }]
  }).then(function (pluginIds) {
    return {
      pluginId: pluginIds[0]
    };
  });
}
/**
 * 
 */
// export function sendRequest(params) {
// 	log('sendMessage', arguments);
// 	let action = (typeof params == 'string' || params instanceof String) ? params : params.action || '';
// 	let data = params && params.data || {};
// 	if (!action) {
// 		return new Promise((resolve, reject) => { reject() });
// 	}
// 	let api_url = params.api_url;// this.store.getters['configs']('api_url');
// 	let type = params.type || "post";
// 	let app_id = params.app_id;//this.store.getters['configs']('app_id')
// 	log('sendRequest', type, api_url + action, data);
// 	// `withCredentials` indicates whether or not cross-site Access-Control requests
// 	// should be made using credentials
// 	let config = {
// 		// withCredentials: true
// 	}
// 	//axios
// 	return request[type](api_url + action, Object.assign({}, data, { app_id }), config)
// 		.then((responce) => {
// 			log('+++++received sendRequest', responce);
// 			return responce;
// 		});
// }

/**
 * 
 * @param {*} params 
 */

function getSettings(params) {
  log("getSettings at:", params); // store.getters['configs']('api_url'))

  var api_url = params.api_url; // store.getters['configs']('api_url');

  return helpers_request.get(api_url + '/settings', params && params.settings || {}).then(function (responce) {
    log('received getSettings', responce.data); // store.commit('settings', responce.data);

    return responce.data;
  });
}
/**
 * =====================================================================================
 */

/* harmony default export */ var helpers = ({
  request: helpers_request,
  log: log,
  isURL: isURL,
  // sendRequest,
  loadFrameworks: helpers_loadFrameworks,
  loadPage: loadPage
});
// CONCATENATED MODULE: ./vue_2/engine/core/apis/apis/kpi.js
/**
 * send events
 */
var lastPage;
var startDate;
var endDate;
var duration = 0;
var fromPage = '';
var toPage = '';
/**
 * 
 * @param {*} Vue 
 * @param {*} options 
 */

function kpi_install(Vue, options) {
  /**
   * call network browser api
   * @param {*} params 
   */
  Vue.prototype.$ca_sendKPI = function (params) {
    //kpi/onpage/:page/:event/:value?
    //kpi/:event/:value?
    var required_params = {
      event: '',
      data: ''
    };
    var data = Object.assign(required_params, params || {});

    if (!data.event) {
      return Promise.resolve('missing prop event');
    }

    return this.$ca_sendRequest({
      // type: 'POST',
      action: "/kpi/",
      data: data
    })["catch"](function (error) {
      return Promise.reject({
        code: 1,
        message: error.message || error || 'error',
        data: {}
      });
    }).then(function (response) {
      return 0 == response.code ? Promise.resolve(response) : Promise.reject(response);
    });
  };
  /**
   * 
   * @param {*} param0 
   */


  Vue.prototype.$ca_setPageEvent = function (_ref) {
    var to = _ref.to,
        from = _ref.from,
        event = _ref.event;
    var vm = this;

    try {
      var allowed = to.matched.some(function (record) {
        var value = record.meta.kpi;
        return typeof value !== "undefined" && value !== null ? !!value : true;
      });
      var authenticated = vm.$store.getters.authenticated; //get name

      toPage = to && typeof to.meta.kpi === 'object' && to.meta.kpi['name'] || to && to.name || toPage;
      fromPage = from && typeof from.meta.kpi === 'object' && from.meta.kpi['name'] || from && from.name || fromPage;

      switch (event) {
        case 'mounted':
          // after reload page
          startDate = new Date();
          break;

        default:
          break;
      } // this.$ca_log('-------------- $ca_setPageEvent 1', { event, allowed, authenticated, lastPage, toPage, fromPage, duration })
      // if page changed


      if (allowed && authenticated && lastPage != toPage) {
        // calc 
        endDate = new Date();
        duration = startDate ? endDate - startDate : 0; //milliseconds interval
        // vm.$ca_log('-------------- $ca_setPageEvent 2 send', event, toPage, fromPage, duration)
        // reset

        startDate = new Date();
        endDate = 0;
        lastPage = toPage; //send event

        vm.$ca_sendKPI({
          event: "onpage",
          data: {
            to: toPage,
            from: fromPage,
            duration: duration
          }
        })["catch"](function (e) {});
      }
    } catch (error) {
      vm.$ca_log('error kpi', error);
    }
  };
  /**
   * 
   */


  options['mixins'] = options['mixins'] || [];
  options['mixins'].push({
    created: function created() {
      var _this = this;

      this.$root.$on('ca_navigate', function (value) {
        _this.$ca_setPageEvent({
          to: _this.$route,
          from: '',
          event: 'ca_navigate'
        });
      });
    },
    mounted: function mounted() {
      this.$ca_setPageEvent({
        to: this.$route,
        from: '',
        event: 'mounted'
      });
    }
  });
  /**
   * in-component
   */

  Vue.mixin({
    beforeRouteEnter: function beforeRouteEnter(to, from, next) {
      // called before the route that renders this component is confirmed.
      // does NOT have access to `this` component instance,
      // because it has not been created yet when this guard is called!
      // console.log('---------beforeRouteEnter ', to.name, from && from.name);
      // However, you can access the instance by passing a callback to next. 
      // The callback will be called when the navigation is confirmed, and the component instance will be passed to the callback as the argument:
      next(function (vm) {
        // access to component instance via `vm`
        vm.$ca_setPageEvent({
          to: to,
          from: from,
          event: 'beforeRouteEnter'
        });
      });
    },
    beforeRouteUpdate: function beforeRouteUpdate(to, from, next) {
      // called when the route that renders this component has changed.
      // This component being reused (by using an explicit `key`) in the new route or not doesn't change anything.
      // For example, for a route with dynamic params `/foo/:id`, when we
      // navigate between `/foo/1` and `/foo/2`, the same `Foo` component instance
      // will be reused (unless you provided a `key` to `<router-view>`), and this hook will be called when that happens.
      // has access to `this` component instance.
      // let authenticated = this.$store.getters.authenticated;
      this.$ca_setPageEvent({
        to: to,
        from: from,
        event: 'beforeRouteUpdate'
      });
      next();
    },
    beforeRouteLeave: function beforeRouteLeave(to, from, next) {
      // called when the route that renders this component is about to
      // be navigated away from.
      // has access to `this` component instance.
      // let authenticated = this.$store.getters.authenticated;
      this.$ca_setPageEvent({
        to: to,
        from: from,
        event: 'beforeRouteLeave'
      });
      next();
    }
  });
}
var kpi_plugin = {
  // eslint-disable-next-line no-undef
  // name: PLUGIN_NAME,
  // version: VERSION,
  install: kpi_install
};
/* harmony default export */ var kpi = (kpi_plugin);
// CONCATENATED MODULE: ./vue_2/engine/core/apis/apis/index.js
// import { log } from '@/common/utils.js';


/**
 * 
 * @param {*} Vue 
 * @param {*} options 
 */

function apis_install(Vue, options) {
  /**
   * load kpi onPage events
   */
  Vue.use(kpi, options);
  /**
   * used to get languages assets
   * @param {*} params 
   */

  Vue.prototype.$ca_getAsset = function (params) {
    var _this = this;

    var resource = typeof params == 'string' || params instanceof String ? params : params.resource || '';

    if (!resource) {
      return new Promise(function (resolve, reject) {
        reject();
      });
    }

    var data = params && params.data || {};
    var type = params.type || "get";
    var app_id = !(params.app_id === undefined) ? params.app_id : this.$store.getters['core/configByName']('app_id');
    var server_url = params.server_url || this.$store.getters['core/configByName']('server_url');
    var url = isURL(resource) ? resource : server_url + "/" + app_id + "/" + resource; // this.$ca_log('getAsset', type, url, data);
    // `withCredentials` indicates whether or not cross-site Access-Control requests
    // should be made using credentials

    var config = params['config'] || {// withCredentials: true
    }; //axios

    return helpers_request[type](url, data, config)["catch"](function (error) {
      _this.$ca_log('ca_getAsset [Error]:', error);

      return Promise.reject(error);
    });
  };
  /**
   * API requests
   * @param {*} params 
   */


  Vue.prototype.$ca_sendRequest = function (params) {
    var _this2 = this;

    this.$ca_log('ca_sendRequest', arguments);
    params = params || {};
    var action = typeof params == 'string' || params instanceof String ? params : params.action || '';
    var api_url = params['url'] || this.$store.getters['core/configByName']('api_url');
    var type = params['type'] || "post";
    var app_id = !(params.app_id === undefined) ? params.app_id : this.$store.getters['core/configByName']('app_id'); //note: on file upload data = new FormData()

    var data = params['data'] || {};
    data["app_id"] = app_id; // `withCredentials` indicates whether or not cross-site Access-Control requests
    // should be made using credentials

    var config = params['config'] || {// withCredentials: true
    };
    this.$ca_log('sendRequest', type, api_url + action, data); //axios

    return helpers_request[type](api_url + action, data, config).then(function (responce) {
      _this2.$ca_log('sendRequest [OK]:', responce);

      return responce;
    })["catch"](function (error) {
      _this2.$ca_log('sendRequest [Error]:', error);

      return Promise.reject(error);
    });
  };
  /**
   * 
   * @param {*} params 
   */


  Vue.prototype.$ca_callNBService = function (params) {
    var _this3 = this;

    var required_params = {
      'service_code': '',
      'msg': '',
      'session_id': '',
      'session_continue': '1',
      // 1:  session_started;  2: params error, but session_started; 32: session_closed
      'cache_enable': false
    };
    var data = Object.assign(required_params, params || {});
    return this.$ca_sendRequest({
      action: '/nbservice',
      data: data
    })["catch"](function (error) {
      //com error
      _this3.$ca_log("ca_callNBService", error);

      return Promise.reject({
        code: 1,
        message: error['message'] || error || 'error' // data: {}

      });
    }).then(function (response) {
      _this3.$ca_log("ca_callNBService", response);

      return 0 == response.data.code ? Promise.resolve(response.data) : Promise.reject(response.data);
    });
  };
  /**
   * 
   * @param {*} params 
   */


  Vue.prototype.$ca_callNBServiceEnd = function (params) {
    return this.$ca_callNBService({
      'session_id': 0,
      'session_continue': "0"
    });
  };
  /**
   * 
   * @param {*} params 
   */


  Vue.prototype.$ca_callNBServiceBack = function (params) {
    return this.$ca_callNBService({
      'msg': '0'
    });
  };
  /**
   * call network browser api
   * @param {*} params 
   */


  Vue.prototype.$ca_callNAPI = function (params) {
    var required_params = {
      "api": "",
      "verb": "GET",
      "params": {}
    };
    var data = Object.assign(required_params, params || {});
    return this.$ca_sendRequest({
      action: '/napi',
      data: data
    })["catch"](function (error) {
      return Promise.reject({
        code: 1,
        message: error.message || error || 'error',
        data: {}
      });
    }).then(function (response) {
      return 0 == response.code ? Promise.resolve(response) : Promise.reject(response);
    });
  };
}
var apis_plugin = {
  // eslint-disable-next-line no-undef
  // name: PLUGIN_NAME,
  // version: VERSION,
  install: apis_install
};
/* harmony default export */ var apis = (apis_plugin); // /**
//  * Auto-install
//   */
// let GlobalVue = null
// if (typeof window !== 'undefined') {
// 	GlobalVue = window.Vue
// } else if (typeof global !== 'undefined') {
// 	GlobalVue = global.Vue
// }
// if (GlobalVue) {
// 	GlobalVue.use(plugin)
// }
// CONCATENATED MODULE: ./vue_2/engine/core/apis/ui/index.js
// import { log } from '@/common/utils.js';

/**
 * 
 * @param {*} Vue 
 * @param {*} options 
 */

function ui_install(Vue, options) {
  Vue.prototype.$ca_setUrlVersion = function (_ref) {
    var url = _ref.url;
    var value = this.$store.getters['core/configByName']('version') + "." + this.$store.getters['core/configByName']('revision');
    var newUrl = url.replace(/version=[0-9\.&]+/, "");

    if (newUrl.indexOf('?') !== newUrl.length - 1) {
      newUrl += newUrl.split('?')[1] ? '&' : '?';
    }

    return newUrl + "version=" + value.replace(/[\.]+/g, '');
  };
  /**
   * 
   */


  Vue.prototype.$ca_getAppAssetsUrl = function (res) {
    if (res === void 0) {
      res = '';
    }

    var app_id = this.$store.getters['core/configByName']('app_id');
    var server_url = this.$store.getters['core/configByName']('server_url');
    var mode = this.$store.getters['core/configByName']('mode');
    mode = 'preview' == mode ? '' : mode + "/";
    var url = server_url + "/" + mode + app_id + "/" + (res || '');
    return url;
  };
  /**
   *
   * @param {*} params
   */


  Vue.prototype.$ca_navigate = function (params) {
    var _this = this;

    // ex: instance.$myMethod()
    // this.$ca_core.navigate
    try {
      //check route path exists:
      this.$ca_log('++++navigate', params); //object.path or string:

      var matchedComponents = this.$router.getMatchedComponents(params['path'] || params || '/');
      this.$ca_log('isRouteExist matchedComponents', params, matchedComponents);

      if (0 < matchedComponents.length) {
        this.$ca_log('navigate path exist');
        this.$router.push(params);
        return Promise.resolve({
          code: 0,
          data: params
        })["finally"](function () {
          console.log("---------emit");

          _this.$root.$emit('ca_navigate', true);
        });
      } else {
        this.$ca_log('navigate path does not exist');
        var app_id = this.$store.getters['core/configByName']('app_id');
        var name = params && (params['path'] || params['name'] || params) || '';
        name = name && name !== '/' ? name.replace('/', '') : name;
        var server_url = this.$store.getters['core/configByName']('server_url');
        var mode = this.$store.getters['core/configByName']('mode');
        var app_path = 'preview' == mode ? '' : "/" + app_id;
        var url = "" + server_url + app_path;
        var loadPlugin;
        /**
         * 
         * TODO 
         * 
         */

        if (window[name]) {
          this.$ca_log('navigate to page use existing compoenent', name);
          loadPlugin = Promise.resolve({
            pluginId: name
          });
        } else {
          loadPlugin = loadPage({
            url: url,
            app_id: app_id,
            name: name
          });
        } //loadPage component:


        return loadPlugin.then(function (_ref2) {
          var pluginId = _ref2.pluginId;

          if (!pluginId) {
            return Promise.reject("page not found.");
          }

          var plugin = window[pluginId]["default"]; //install plugin

          Vue.use(plugin, {
            app_id: app_id,
            params: params
          });
          return new Promise(function (resolve, reject) {
            //load page into routes
            Vue.nextTick(function () {
              var component = window.ca['apps'][app_id]['components'][pluginId]['default'] || window.ca['apps'][app_id]['components'][pluginId]; // var requiresAuth = (typeof component['requiresAuth'] !== 'undefined') ? !!component['requiresAuth'] : true;

              var route = {
                "path": params.path,
                "name": component.name || name,
                component: component,
                "meta": {
                  "requiresAuth": true
                }
              };

              _this.$router.addRoutes([route]);

              _this.$router.push(params);

              resolve({
                code: 0,
                data: params
              });
            });
          });
        })["catch"](function (error) {
          _this.$ca_log('navigate to page failed', error);

          return Promise.reject({
            code: 1,
            message: error['message']
          });
        });
      }
    } catch (error) {
      this.$ca_log('error: navigate', error);
      return Promise.reject({
        code: 1,
        message: error['message']
      });
    }
  };
  /**
  	
  */


  Vue.prototype.$ca_checkRegistration = function () {
    this.$ca_log("+++++++checkRegistration", arguments);
    return this.$ca_login();
  };
  /**
   *
   */


  Vue.prototype.$ca_userRegistration = function (params) {
    var _this2 = this;

    this.$ca_log("login", arguments);
    var app_id = this.$store.getters['core/configByName']('app_id');
    return this.$ca_sendRequest({
      action: '/registration',
      data: Object.assign({}, params || {}, {
        app_id: app_id
      })
    }).then(function (responce) {
      _this2.$ca_log('received registration:', responce.data);

      var res = responce.data || {};

      if (0 == res.code) {
        return res;
      }

      return Promise.reject({
        code: 401,
        message: "The username and / or password is incorrect."
      }); // throw new Error("The username and / or password is incorrect.");
    })["catch"](function (error) {
      _this2.$ca_log(error);

      return Promise.reject({
        code: 1,
        message: error['message'] || "Login failed"
      });
    });
  };
  /**
   *
   */


  Vue.prototype.$ca_login = function (params) {
    var _this3 = this;

    this.$ca_log("login", arguments);
    var deviceInfo = false;

    if (typeof device !== 'undefined' && true == device.available) {
      deviceInfo = {
        'platform': (device.platform || '').toLowerCase(),
        'version': (device.version || '').toLowerCase(),
        'uuid': device.uuid || ''
      };
    }

    var isdevice = false;

    (function (a) {
      isdevice = /(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino/i.test(a) || /1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(a.substr(0, 4));
    })(navigator.userAgent || navigator.vendor || window.opera);

    var lang, app_revision;
    var app_id = this.$store.getters['core/configByName']('app_id');
    return this.$ca_sendRequest({
      action: '/login',
      data: Object.assign({}, params || {}, {
        app_id: app_id,
        isdevice: isdevice,
        device: deviceInfo,
        lang: lang,
        app_revision: app_revision
      })
    }).then(function (responce) {
      _this3.$ca_log('received login:', responce.data);

      var res = responce.data || {};

      if (0 == res.code && "logged" == res.data.status) {
        _this3.$store.commit("core/AUTHENTICATE", true);

        _this3.$store.commit("core/USER", res.data['msisdn'] || '');

        return res;
      }

      return Promise.reject({
        code: 401,
        message: "The username and / or password is incorrect."
      }); // throw new Error("The username and / or password is incorrect.");
    })["catch"](function (error) {
      _this3.$ca_log(error);

      // _this3.$store.commit("core/USER", res.data['msisdn'] || '');

      _this3.$store.commit("core/AUTHENTICATE", false);

      return Promise.reject({
        code: error['code'] || 1,
        message: error['message'] || "Login failed"
      });
    });
  };
  /**
   *
   */


  Vue.prototype.$ca_logout = function (params) {
    var _this4 = this;

    this.$ca_log("logout", arguments);
    return this.$ca_sendRequest({
      action: '/logout'
    }).then(function (responce) {
      _this4.$ca_log('received logout:', responce.data);

      return responce.data;
    })["catch"](function (error) {
      _this4.$ca_log(error);

      return Promise.reject({
        code: 1,
        message: error["message"] || "Logout failed"
      }); // throw error
    })["finally"](function () {
      // always executed
      _this4.$ca_navigate({
        path: '/login'
      });
    });
  };
  /**
   *
   */


  Vue.prototype.$ca_popup = function (msg) {
    this.$ca_log("popup", msg);
    alert(msg || 'ca_core error');
  };

  Vue.prototype.$ca_showLoading = function (status) {
    this.$ca_log("showLoading", !!status);
    return new Promise(function (resolve, reject) {
      resolve();
    });
  };
  /**
   *
   */


  Vue.prototype.$ca_ui = function (params) {
    var _this5 = this;

    this.$ca_log("ca_initUi 1", params); // return this.getSettings().then((settings) => {

    var settings = params.configs; // this.$store.commit('core/settings', settings);

    return Promise.resolve();
    return loadFrameworks(settings, this.$store.getters['core/configs']).then(function () {
      _this5.$ca_log("ca_initUi 2", settings);

      if (settings['app_entry_bundle']) {
        return loadPage(Object.assign({}, {
          page_name: settings['app_entry_bundle']
        }, params));
      }
    });
  };
  /**
  *
  */


  Vue.prototype.$ca_optionMenuItems = function () {
    return routes;
  };
  /**
  *
  */
  // Vue.prototype.$ca_isRouteExist = function (params) {
  // 	// var link = this.$router.resolve({ name: name });
  // 	var matchedComponents = this.$router.getMatchedComponents(params.path)
  // 	this.$ca_log('isRouteExist matchedComponents', params, matchedComponents.length);
  // 	return (0 < matchedComponents.length)
  // }

}
var ui_plugin = {
  // eslint-disable-next-line no-undef
  // name: PLUGIN_NAME,
  // version: VERSION,
  install: ui_install
};
/* harmony default export */ var ui = (ui_plugin);
// CONCATENATED MODULE: ./vue_2/engine/core/apis/index.js
// import { log } from '@/common/utils.js';



/**
 * 
 * @param {*} Vue 
 * @param {*} options 
 */

function core_apis_install(Vue, options) {
  //==============================================
  // 1. add global method or property
  // Vue.myGlobalMethod = function () { 
  // 	// some logic ...
  // 	// ex: Vue.myGlobalMethod()
  // }
  // 2. add a global asset
  // Vue.directive('my-directive', {
  // 	bind(el, binding, vnode, oldVnode) { // some logic ...  } })
  // 3. inject some component options
  // Vue.mixin({ 	created() { }  })
  // 4. add an instance method

  /**
   * example @click="this.$ca_log('clicked')"
   */
  // Vue.prototype.$ca_init = function () {};
  Vue.prototype.$ca_log = log;
  Vue.use(apis, options);
  Vue.use(ui, options);
}
var core_apis_plugin = {
  // eslint-disable-next-line no-undef
  // name: PLUGIN_NAME,
  // version: VERSION,
  install: core_apis_install
};
/* harmony default export */ var core_apis = (core_apis_plugin); // /**
//  * Auto-install
//   */ 
// let GlobalVue = null
// if (typeof window !== 'undefined') {
// 	GlobalVue = window.Vue
// } else if (typeof global !== 'undefined') {
// 	GlobalVue = global.Vue
// }
// if (GlobalVue) {
// 	GlobalVue.use(plugin)
// }
// EXTERNAL MODULE: external "Vue"
var external_Vue_ = __webpack_require__(3);
var external_Vue_default = /*#__PURE__*/__webpack_require__.n(external_Vue_);

// EXTERNAL MODULE: external "VueI18n"
var external_VueI18n_ = __webpack_require__(2);
var external_VueI18n_default = /*#__PURE__*/__webpack_require__.n(external_VueI18n_);

// CONCATENATED MODULE: ./vue_2/engine/core/languages/i18n-setup.js
/**
 * https://kazupon.github.io/vue-i18n/guide/formatting.html#html-formatting
 * example
 Locale messages:
const messages = {
  en: {
	message: {
	  hello: '{0} world'
	}
  }
}

Template:
<p>{{ $t('message.hello', ['hello']) }}</p>

Output:
<p>hello world</p>
 */

 // import { log } from '@/utils/';

external_Vue_default.a.use(external_VueI18n_default.a); // function createLanguageMng(options) {

var default_lang = 'en'; // const loadedLanguages = [] // our default language that is preloaded

var listMessages = {// "test": {
  // 	"HOME": "Home",
  // }
};
/**
 * 
 */

var i18n = new external_VueI18n_default.a({
  locale: default_lang,
  // set locale
  fallbackLocale: default_lang,
  messages: listMessages // set locale messages

});
/**
 * 
 * @param {*} request 
 * @param {*} path 
 * @param {*} lang 
 */

function setLanguage(_ref) {
  var lang = _ref.lang,
      getMessages = _ref.getMessages,
      _ref$reload = _ref.reload,
      reload = _ref$reload === void 0 ? false : _ref$reload,
      messages = _ref.messages;

  if (messages) {
    listMessages = Object.assign(listMessages, messages);
  }

  var setI18nLanguage = function setI18nLanguage(lang) {
    i18n.locale = lang; // axios.defaults.headers.common['Accept-Language'] = lang

    document.querySelector('html').setAttribute('lang', lang);
    return lang;
  };

  if (!reload) {
    // If the same language
    if (i18n.locale === lang) {
      return Promise.resolve(setI18nLanguage(lang));
    } // log('i18n');
    // If the language was already loaded


    if (i18n.messages[lang]) {
      return Promise.resolve(setI18nLanguage(lang));
    } // lang exists or loaded


    if (listMessages[lang]) {
      i18n.setLocaleMessage(lang, listMessages[lang]);
      return Promise.resolve(setI18nLanguage(lang));
    }
  }

  if (getMessages) {
    return getMessages().then(function (messages) {
      if (!messages[lang]) {
        // log('Error setLanguage: incorrect lang structure.');
        return;
      } //keep received messages


      listMessages = Object.assign(listMessages, messages); //set messages

      i18n.setLocaleMessage(lang, messages[lang]);
      return setI18nLanguage(lang);
    })["catch"](function (err) {});
  }
}
/* harmony default export */ var i18n_setup = ({
  i18n: i18n,
  setLanguage: setLanguage
});
// CONCATENATED MODULE: ./vue_2/engine/core/languages/index.js

/**
 * 
 * @param {*} Vue 
 * @param {*} options 
 */

function languages_install(Vue, options) {
  options['i18n'] = i18n; //	ca_core;  else added at www/index.js

  Vue.prototype.$ca_setLanguage = function (lang, options) {
    var _this = this;

    var path = options && options.path || "assets/languages/";
    var url = path + "/messages.json"; //helper get all messages

    var getMessages = function getMessages() {
      return _this.$ca_getAsset(url).then(function (responce) {
        return responce.data;
      });
    };

    var params = Object.assign({
      lang: lang,
      getMessages: getMessages,
      reload: false
    }, options);
    return setLanguage(params);
  };

  Vue.prototype.$ca_loadLanguageAsync = Vue.prototype.$ca_setLanguage;
}
var languages_plugin = {
  // eslint-disable-next-line no-undef
  // name: PLUGIN_NAME,
  // version: VERSION,
  install: languages_install
};
/* harmony default export */ var languages = (languages_plugin); // /**
//  * Auto-install
//   */
// let GlobalVue = null
// if (typeof window !== 'undefined') {
// 	GlobalVue = window.Vue
// } else if (typeof global !== 'undefined') {
// 	GlobalVue = global.Vue
// }
// if (GlobalVue) {
// 	GlobalVue.use(plugin)
// }
// CONCATENATED MODULE: ./vue_2/engine/core/application/index.js
/**
 * 
 * @param {*} Vue 
 * @param {*} options 
 */
function application_install(Vue, options) {
  // 	// 1. add global method or property
  // 	Vue.myGlobalMethod = function () {
  // 		// some logic ...
  // 	}
  // 	// 2. add a global asset
  // 	Vue.directive('my-directive', {
  // 		bind(el, binding, vnode, oldVnode) {
  // 			// some logic ...
  // 		}
  //     ...
  //   })
  // 	// 3. inject some component options				 // Notice: applyed all component
  // 	Vue.mixin({
  // 		created: function () {
  // 			// some logic ...
  // 		}
  //     ...
  //   })
  // 	// 4. add an instance method
  // 	Vue.prototype.$myMethod = function (methodOptions) {
  // 		// some logic ...
  // 	}
  // The Root Element  from EJS file
  options['el'] = options['el'] || '#app';
  /**
   * Notice:
   * Appllyed to App vue instance, but not to all components;
   * Fired before ones defined at the app;
   */

  var appMixin = {
    data: function data() {
      return {// message: 'hello'
      };
    },
    created: function created() {
      var _this = this;

      console.log("[ca_core] application created", ca);
      var configs = this.$options['CaConfigs'] || this.$options['AppConfigs']; // window.ca.apps[configs.app_id]['options'] = options;

      window.ca.apps[configs.app_id]['app'] = this;
      /**
       * cordova
       */

      var configuration = window.ca.apps[configs.app_id].configs;
      this.$store.dispatch('core/init', {
        configs: configuration
      });
      setTimeout(function () {
        _this.$ca_ui({
          rootEl: '#addon_container'
        }).then(function (data) {
          /**
           * app loaded
           */
        });
      }, 0);
    }
  };
  options['mixins'] = options['mixins'] || [];
  options['mixins'].push(appMixin);
  /**
   * 
   */

  if (configs['platform'] == "cordova") //ejs
    {
      document.addEventListener('deviceready', function () {
        try {
          navigator.splashscreen.hide();
        } catch (error) {
          console.log("error on splashscreen.hide", error);
        }
      });
    }
}
var application_plugin = {
  install: application_install
};
/* harmony default export */ var application = (application_plugin);
// CONCATENATED MODULE: ./vue_2/engine/core/index.js
/**
 *		CA_CORE 
 *	Install all ca plugins
 *
 *  /occa2/projects/assets/studio/engines/vue_2/apis/
 */
// import utils from './utils';
 // Vuex modals module





/**
 * 
 * @param {*} Vue 
 * @param {*} options
 */

function core_install(Vue, options) {
  //loaded app`s pages/bundles
  var configs = options['CaConfigs'] || options['AppConfigs'];

  try {
    console.log("[ca_core]", configs_configs.type, configs_configs.version);
    ca[configs_configs.name] = {
      cfg: configs_configs,
      configs: configs
    };
  } catch (error) {}

  ca.apps[configs.app_id]['components'] = {};
  console.log("[ca_core]", ca);
  /**
   * keep order
   */

  Vue.use(store, options);
  Vue.use(core_apis, options);
  Vue.use(languages, options);
  Vue.use(application, options);
}
var core_plugin = {
  install: core_install
};
/* harmony default export */ var core = __webpack_exports__["default"] = (core_plugin);
/**
 * Auto-install
  */
// let GlobalVue = null;
// if (typeof window !== 'undefined') {
// 	GlobalVue = window.Vue
// } else if (typeof global !== 'undefined') {
// 	GlobalVue = global.Vue
// }
// if (GlobalVue) {
// 	GlobalVue.use(plugin)
// }

/***/ })
/******/ ]);
});