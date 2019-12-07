const Apify = require('apify');
const { log } = Apify.utils;

function checkAndEval(extendOutputFunction) {
  let evaledExtendOutputFunction;

  try {
      evaledExtendOutputFunction = eval(extendOutputFunction);
  } catch (e) {
      throw new Error(`extendOutputFunction is not a valid JavaScript! Error: ${e}`);
  }

  if (typeof evaledExtendOutputFunction !== "function") {
      throw new Error(`extendOutputFunction is not a function! Please fix it or use just default output!`);
  }

  return evaledExtendOutputFunction;
}

function checkAndCreateUrlSource(startUrls) {
  const sources = [];

  for (const url of startUrls) {
    // if url is the homepage
    if (url === 'https://www.forever21.com') {
      sources.push({ url, userData: { label: 'HOMEPAGE' } });
    }
    else if (/-main|_main/.test(url)) { // check QUI, forse devo creare regexp object!!
      log.warning(`The following url has not been added to the queue: ${url}.\nPlease choose a url from the sub-menu of the category. For more information, have a look at the actor documentation under "INPUT guidelines".`);
    }
    // if it's a category page
    else if (url.includes('catalog/category/')) {
      sources.push({ url, userData: { label: 'SUBCAT' } });
    }
    // if it's a product page
    else if (/[0-9]{8,12}$/.test(url)) {
      sources.push({ url, userData: { label: 'PRODUCT' } });
    }
    else {
      // manage error here
      log.warning(`The following url has not been added to the queue: ${url}.\nIt may be due to incorrect format or unsupported url. For more information, have a look at the actor documentation under "INPUT guidelines".`);
    }
  }

  return sources;
}

function setUpProxy(proxyConfiguration) {
  const { customProxyUrls } = proxyConfiguration;

  if (!customProxyUrls) {
    let username = '';

    if (proxyConfiguration.groups) username += `groups-${proxyConfiguration.groups},`;
    username += `country-${proxyConfiguration.country}`;

    const password = process.env.APIFY_PROXY_PASSWORD;

    const proxyUrl = `http://${username}:${password}@proxy.apify.com:8000`;
    log.info(`Proxy url has been setup: http://${username}:*****@proxy.apify.com:8000`);

    return [ proxyUrl ];
  }
  else {
    return customProxyUrls;
  }
}

async function maxItemsCheck(maxItems, dataset, requestQueue) {
  if (maxItems) {
    const { itemCount } = await dataset.getInfo();

    // if (itemCount >= maxItems) {
    //   await requestQueue.drop();
    //   return true;
    // }
    return itemCount >= maxItems
  }
}

async function enqueueNextPages(request, requestQueue, totalPages) {
  const currentBaseUrl = request.url.split('#')[0];

  // add all successive pages for this subcat
  for (let i = 2; i <= totalPages; i++) {
    const info = await requestQueue.addRequest({
      url: `${currentBaseUrl}#pageno=${i}`,
      keepUrlFragment: true,
      userData: { label: 'SUBCAT'}
    });

    log.info('Added', info.request.url);
  }

}

async function enqueueAllSupportedCategories($, requestQueue) {
  const BASE_URL = 'https://www.forever21.com';

  const menuCats = $('div.d_new_mega_menu').toArray();
  let totalEnqueued = 0;

  for (const menuDiv of menuCats) {
    // const hrefs = $(menuDiv).find('a').toArray().map(a => $(a).attr('href'));
    // const hrefs = $(menuDiv).find('a').toArray();
    const hrefs = $(menuDiv).find('a').toArray().map(a => a.attribs.href);

    // filter out unsupported categories
    const supportedHrefs = hrefs.filter(href => {
      if (/-main|_main/.test(href)) return false;
      if (!href.includes('catalog/category/')) return false;

      return true;
    });

    totalEnqueued += supportedHrefs.length;
    console.log('supportedHrefs', supportedHrefs);

    for (const href of supportedHrefs) {
      await requestQueue.addRequest({
        url: BASE_URL + href,
        userData: { label: 'SUBCAT'}
      });

      log.info('From homepage, added subcategory:', href);
    }
  }

  return totalEnqueued;
}

async function applyFunction($, evaledExtendOutputFunction, items) {
  const isObject = (val) => typeof val === 'object' && val !== null && !Array.isArray(val);

  let userResult = {};
  try {
    userResult = await evaledExtendOutputFunction($);
  } catch (err) {
    console.log(`extendOutputFunction crashed! Pushing default output. Please fix your function if you want to update the output. Error: ${e}`);
  }

  if (!isObject(userResult)) {
    console.log('extendOutputFunction must return an object!!!');
    process.exit(1);
  }

  items.forEach((item, i) => {
    items[i] = { ...item, ...userResult };
  });

  return items;
}

module.exports = {
  checkAndEval,
  checkAndCreateUrlSource,
  setUpProxy,
  maxItemsCheck,
  enqueueNextPages,
  enqueueAllSupportedCategories,
  applyFunction,
}
