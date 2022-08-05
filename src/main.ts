import {Actor} from 'apify';
import {CheerioCrawler} from 'crawlee';
import {RequestQueue} from "apify";

interface InputSchema {
    keyword: string;
}

enum RequestLabel {
    START = "START",
    PRODUCT_DETAIL = "PRODUCT_DETAIL",
    PRODUCT_OFFERS = "PRODUCT_OFFERS"
}

const proxyConfiguration = await Actor.createProxyConfiguration({
    groups: ['RESIDENTIAL']
});

const BASE_URL = "https://amazon.com";

const getFriendlyProductUrl = (asin: string) => `${BASE_URL}/dp/${asin}`;
const getOfferUrl = (asin: string) => `${BASE_URL}/gp/aod/ajax/ref=auto_load_aod?asin=${asin}&pc=dp`;

await Actor.main(async () => {
    //const keyword = Actor.getInput<InputSchema>();
    const keyword = "iphone"; // TODO delete

    const requestQueue = await RequestQueue.open();

    await requestQueue.addRequest({
        url: `https://www.amazon.com/s?k=${keyword}&ref=nb_sb_noss`,
        label: RequestLabel.START
    });

    // TODO change to Dataset
    const results = [];

    const crawler = new CheerioCrawler({
        requestQueue,
        useSessionPool: true,
        maxConcurrency: 50,
        proxyConfiguration,
        requestHandler: async ({$, response, request}) => {
            if (request.label === RequestLabel.START) {
                // Get all reliable asins
                const searchResults = $('[cel_widget_id^=MAIN-SEARCH_RESULTS]')
                    .parents('[data-asin]');

                for (const searchResult of searchResults) {
                    const asin = $(searchResult).data("asin") as string;
                    const link = $(searchResult).find("a");
                    const itemUrl = getFriendlyProductUrl(asin);

                    await requestQueue.addRequest({
                        url: `${BASE_URL}${link.eq(0).attr("href")}`,
                        label: RequestLabel.PRODUCT_DETAIL,
                        userData: {
                            data: {
                                asin,
                                itemUrl,
                                keyword
                            }
                        }
                    });
                }
                return; // TODO change to switch
            }

            if (request.label === RequestLabel.PRODUCT_DETAIL) {
                const title = $("[cel_widget_id=Title]").text()

                const { asin } = request.userData.data;

                await requestQueue.addRequest({
                    url: getOfferUrl(asin),
                    label: RequestLabel.PRODUCT_OFFERS,
                    userData: {
                        data: {
                            ...request.userData.data,
                            title
                        }
                    }
                });

                return; // TODO change to switch
            }

            if (request.label === RequestLabel.PRODUCT_OFFERS) {
                const offerElements = $(".aod-offer-soldBy");

                $(offerElements).each((_, offerElement) => {
                    results.push({
                        title: request.userData.title,
                        description: request.userData.description,
                        itemUrl: request.userData.itemUrl,
                        keyword: request.userData.keyword,
                        sellerName: $(offerElement).find("a").text(),
                        offer: $(offerElement).find(".a-offscreen").text()
                    });
                });

                return; // TODO change to switch
            }
            console.log(response.url);
        }
    });

    await crawler.run();

    if (results.length === 0) throw "There are no results"; // TODO delete
});
