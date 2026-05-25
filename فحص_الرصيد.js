const AhlaAPI = require('./ahla_api_client.js');

async function main() {
    const api = new AhlaAPI();
    
    const phone = '0558606784';
    const pin = '7840';
    
    console.log(`Logging in with ${phone}...`);
    await api.login(phone, pin);
    
    if (api.loggedIn) {
        console.log('\n=== Testing *200# ===');
        const res200 = await api.callNBService('*200#');
        console.log(JSON.stringify(res200, null, 2));

        console.log('\n=== Testing *200*PIN# ===');
        const res200pin = await api.callNBService(`*200*${pin}#`);
        console.log(JSON.stringify(res200pin, null, 2));
        
        console.log('\n=== Testing *222# ===');
        const res222 = await api.callNBService('*222#');
        console.log(JSON.stringify(res222, null, 2));

        console.log('\n=== Testing *580# ===');
        const res580 = await api.callNBService('*580#');
        console.log(JSON.stringify(res580, null, 2));
    }
}
main().catch(console.error);
