const fs = require('fs');

const targetPath = 'c:\\Users\\wahab phone\\Desktop\\server sit web\\Cloud_Portal_Ready\\index.html';
let content = fs.readFileSync(targetPath, 'utf8');

// Replace the getFlexyOffers fetch block with apiRequest for local server
const regexGetOffers = /fetch\(RACINE_PATH \+ "\/getFlexyOffers\?phoneNbr=" \+ phoneNumber\)[\s\S]*?console\.log\("Request failed", error\);\s*}\s*\);/g;

const replacementOffers = `
            apiRequest('/api/customer/live-offers', 'POST', { phone: phoneNumber })
                .then((data) => {
                    isLoadingOffers = false;
                    let offersListHtml = "";
                    if (data && data.success && data.offers) {
                        if (data.offers.length > 0) {
                            data.offers.sort((a,b)=>a.price-b.price).forEach((off) => {
                                offersListHtml += 
                                    '<label data-bs-toggle="list" data-offer-name="'+off.name+'" data-offer-id="'+off.id+'" data-offer-price="'+off.price+'" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center gap-3">' +
                                        '<span class="badge bg-primary fs-big"><span>'+off.price+'</span> دج </span>' +
                                        off.name +
                                    '</label>';
                            });
                        } else {
                            offersListHtml = '<label class="list-group-item list-group-item-danger">لا توجد عروض لهذا الرقم</label>';
                        }
                    } else {
                        offersListHtml = '<label class="list-group-item list-group-item-danger">' + (data.message || 'خطأ في جلب العروض') + '</label>';
                    }
                    $("#offersList").html(offersListHtml).change();
                    $('#offerSpinner').hide();
                })
                .catch(function (error) {
                    isLoadingOffers = false;
                    console.log("Request failed", error);
                    $("#offersList").html('<label class="list-group-item list-group-item-danger">فشل الاتصال بالخادم</label>').change();
                    $('#offerSpinner').hide();
                });
`;

content = content.replace(regexGetOffers, replacementOffers.trim());


// We also need to fix the sendOfferBtn click logic which I previously patched in rewrite_flexy.js
// The old patch was:
// window.selectedOfferData = { type: 'offer', id: offerName, price: amount, name: offerName };
// executeRecharge('flexy');

const regexSendOffer = /window\.selectedOfferData = \{ type: 'offer', id: offerName, price: amount, name: offerName \};/g;

const replacementSendOffer = `
        let activeEl = $("#offersList .active");
        let offerId = activeEl.data("offer-id") || offerName;
        let offerPrice = activeEl.data("offer-price") || amount;
        window.selectedOfferData = { type: 'offer', id: offerId, price: offerPrice, name: offerName };
`;

content = content.replace(regexSendOffer, replacementSendOffer.trim());

fs.writeFileSync(targetPath, content);
console.log('Successfully patched getFlexyOffers to use local /api/customer/live-offers');
