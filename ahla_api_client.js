/**
 * Ooredoo Ahla Direct API Client
 * Base URL: https://apps.ooredoo.dz/carrier-prod/api
 * 
 * Discovered endpoints:
 * - POST /login       - Login with username/password
 * - POST /gethome     - Get home page config
 * - POST /nbservice   - Execute USSD service
 * - POST /kpi/        - Send KPI events
 * - GET  /settings    - Get app settings
 * - POST /registration - Register user
 * - POST /logout       - Logout
 * - POST /napi         - Network API call
 */

const https = require('https');

const BASE_URL = 'https://apps.ooredoo.dz/carrier-prod/api';
const APP_ID = 'ussd_app';

class AhlaAPI {
  constructor() {
    this.cookies = '';
    this.loggedIn = false;
    this.msisdn = '';
  }

  /**
   * Make an HTTP request
   */
  _request(method, endpoint, body = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(BASE_URL + endpoint);
      const options = {
        hostname: url.hostname,
        path: url.pathname,
        method: method,
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'Content-Type': 'application/json;charset=utf-8',
          'User-Agent': 'Mozilla/5.0 (Linux; Android 9; Nexus 5 Build/MRA58N)',
        }
      };

      if (this.cookies) {
        options.headers['Cookie'] = this.cookies;
      }

      const req = https.request(options, (res) => {
        let data = '';
        
        // Capture cookies
        const setCookie = res.headers['set-cookie'];
        if (setCookie) {
          this.cookies = setCookie.map(c => c.split(';')[0]).join('; ');
        }

        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve({ status: res.statusCode, headers: res.headers, data: json });
          } catch (e) {
            resolve({ status: res.statusCode, headers: res.headers, data: data });
          }
        });
      });

      req.on('error', (err) => reject(err));

      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  }

  /**
   * Login
   * @param {string} username - Phone number (e.g., "0558606784")  
   * @param {string} password - PIN code (e.g., "7840")
   */
  async login(username, password) {
    console.log(`[LOGIN] Attempting login for ${username}...`);
    const result = await this._request('POST', '/login', {
      username: username,
      password: password,
      app_id: APP_ID,
      isdevice: false,
      device: {
        platform: 'android',
        version: '9',
        uuid: '10cab9670649e373'
      }
    });

    console.log(`[LOGIN] Response:`, JSON.stringify(result.data));

    if (result.data.code === 0 && result.data.data && result.data.data.status === 'logged') {
      this.loggedIn = true;
      this.msisdn = result.data.data.msisdn;
      console.log(`[LOGIN] ✅ Success! MSISDN: ${this.msisdn}`);
    } else {
      console.log(`[LOGIN] ❌ Failed: ${result.data.message || 'Unknown error'}`);
    }

    return result.data;
  }

  /**
   * Get Home page
   */
  async getHome() {
    console.log(`[GETHOME] Fetching home page...`);
    const result = await this._request('POST', '/gethome', { app_id: APP_ID });
    console.log(`[GETHOME] Response:`, JSON.stringify(result.data));
    return result.data;
  }

  /**
   * Call NB Service (USSD)
   * @param {string} serviceCode - e.g., "*222#"
   * @param {string} msg - Message/selection (e.g., "1" to select first option)
   * @param {string} sessionId - Session ID (empty for new session)
   * @param {string} sessionContinue - "1" to continue, "0" to end
   */
  async callNBService(serviceCode, msg = '', sessionId = '', sessionContinue = '1') {
    console.log(`[NBSERVICE] Code: ${serviceCode}, Msg: ${msg}, Session: ${sessionId}`);
    const result = await this._request('POST', '/nbservice', {
      service_code: serviceCode,
      msg: msg,
      session_id: sessionId,
      session_continue: sessionContinue,
      cache_enable: false,
      app_id: APP_ID
    });
    console.log(`[NBSERVICE] Response:`, JSON.stringify(result.data));
    return result.data;
  }

  /**
   * End NB Service session
   */
  async endNBService() {
    return this.callNBService('', '', '0', '0');
  }

  /**
   * Get Settings
   */
  async getSettings() {
    console.log(`[SETTINGS] Fetching settings...`);
    const result = await this._request('GET', '/settings');
    console.log(`[SETTINGS] Response:`, JSON.stringify(result.data));
    return result.data;
  }

  /**
   * Logout
   */
  async logout() {
    console.log(`[LOGOUT] Logging out...`);
    const result = await this._request('POST', '/logout', { app_id: APP_ID });
    console.log(`[LOGOUT] Response:`, JSON.stringify(result.data));
    this.loggedIn = false;
    return result.data;
  }

  /**
   * Call NAPI
   * @param {string} api - API name
   * @param {string} verb - HTTP verb
   * @param {object} params - Parameters
   */
  async callNAPI(api, verb = 'GET', params = {}) {
    console.log(`[NAPI] API: ${api}, Verb: ${verb}`);
    const result = await this._request('POST', '/napi', {
      api: api,
      verb: verb,
      params: params,
      app_id: APP_ID
    });
    console.log(`[NAPI] Response:`, JSON.stringify(result.data));
    return result.data;
  }
}
module.exports = AhlaAPI;

// === MAIN ===
async function main() {
  const api = new AhlaAPI();

  // 1. Login
  await api.login('0558606784', '7840');

  if (api.loggedIn) {
    // 2. Get Home
    await api.getHome();

    // 3. Check balance via USSD *222#
    console.log('\n=== Checking Balance ===');
    const balance = await api.callNBService('*222#');
    console.log('Balance result:', JSON.stringify(balance, null, 2));
  }
}

if (require.main === module) {
  main().catch(console.error);
}
