/*
   parser for *.wixsite.com
   This site unusual as it does not put the content directly in the HTML for each "chapter/page".
   Instead the javascript in the chapter/page makes an AJAX/REST call to get the content.
   So, this parser needs to obtain the URL for the AJAX/REST calls for the content and use them.
*/
"use strict";

parserFactory.registerRule(
    function(url, dom) {           // eslint-disable-line no-unused-vars
        return util.extractHostName(url).endsWith(".wixsite.com"); 
    }, 
    function() { return new WixParser() }
);

class WixParser extends Parser{
    constructor() {
        super();
    }

    getChapterUrls(dom) {
        this.mapPageUrltoRestUrl = this.buildMapOfPageUrltoRestUrlWithContent(dom);
        let chapters = util.hyperlinksToChapterList(dom.body);
        return Promise.resolve(chapters);
    };

    buildMapOfPageUrltoRestUrlWithContent(dom) {
        let json = this.findJsonWithRestUrls(dom);
        return this.extractRestUrlsFromJson(json);
    }

    findJsonWithRestUrls(dom) {
        for(let script of util.getElements(dom, "script")) {
            let text = script.innerHTML;
            let index = text.indexOf("var publicModel = {")
            if (0 <= index) {
                index = text.indexOf("{", index);
                let end = util.findIndexOfClosingBracket(text, index);
                return JSON.parse(text.substring(index, end + 1));
            }
        };
    }    

    extractRestUrlsFromJson(json) {
        let topology = json.pageList.topology[0];
        let urlsFromPage = function(page) {
            return { 
                pageUrl: json.externalBaseUrl + "/" + page.pageUriSEO,
                restUrl: topology.baseUrl + 
                    topology.parts.replace("{filename}",  page.pageJsonFileName)
            };
        };
        return json.pageList.pages
            .map(page => urlsFromPage(page))
            .reduce((acc, urls) => acc.set(urls.pageUrl, urls.restUrl), new Map());
    }

    findContent(dom) {
        return util.getElement(dom, "div");
    };

    fetchChapter(url) {
        let that = this;
        let restUrl = this.mapPageUrltoRestUrl.get(url);
        return HttpClient.fetchJson(restUrl).then(function (handler) {
            let content = that.findContentInJson(handler.json);
            return Promise.resolve(that.constructDoc(content, url));
        });
    }
    
    findContentInJson(json) {
        let wantedComponentName = json.structure.components[0].dataQuery.substring(1);
        return json.data.document_data[wantedComponentName].text;
    }

    constructDoc(content, url) {
        let html = "<html><head><title></title><body><div>" + content + "</div></body></html>";
        let doc = new DOMParser().parseFromString(html, "text/html");
        doc.baseUrl = url;
        return doc;
    }
}
