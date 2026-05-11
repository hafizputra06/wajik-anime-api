import errorinCuy from "./errorinCuy.js";
import sanitizeHtml from "sanitize-html";
export const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36 Edg/136.0.0.0";
const FETCH_TIMEOUT = 30000;
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;
async function fetchWithTimeout(url, options, timeout) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal,
        });
        clearTimeout(timeoutId);
        return response;
    }
    catch (error) {
        clearTimeout(timeoutId);
        if (error instanceof Error && error.name === "AbortError") {
            throw errorinCuy(504);
        }
        throw error;
    }
}
async function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
export default async function getHTML(baseUrl, pathname, ref, sanitize = false, retryCount = 0) {
    const url = new URL(pathname, baseUrl);
    const headers = {
        "User-Agent": userAgent,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        Connection: "keep-alive",
    };
    if (ref) {
        headers.Referer = ref.startsWith("http") ? ref : new URL(ref, baseUrl).toString();
    }
    console.log(`[getHTML] Fetching: ${url.toString()} (attempt ${retryCount + 1})`);
    try {
        const response = await fetchWithTimeout(url, { headers, redirect: "manual" }, FETCH_TIMEOUT);
        console.log(`[getHTML] Status: ${response.status}, StatusText: ${response.statusText}`);
        if (response.status === 403 || response.status === 429) {
            if (retryCount < MAX_RETRIES) {
                console.log(`[getHTML] Retrying after ${RETRY_DELAY}ms...`);
                await delay(RETRY_DELAY);
                return getHTML(baseUrl, pathname, ref, sanitize, retryCount + 1);
            }
            console.log(`[getHTML] Max retries reached for 403/429`);
        }
        if (!response.ok) {
            response.status > 399 ? errorinCuy(response.status) : errorinCuy(404);
        }
        const location = response.headers.get("location");
        if (location) {
            console.log(`[getHTML] Redirect to: ${location}`);
        }
        const html = await response.text();
        if (!html.trim()) {
            console.log(`[getHTML] Empty response`);
            errorinCuy(404);
        }
        console.log(`[getHTML] HTML length: ${html.length}`);
        if (sanitize) {
            return sanitizeHtml(html, {
                allowedTags: [
                    "address", "article", "aside", "footer", "header", "h1", "h2", "h3", "h4", "h5", "h6",
                    "main", "nav", "section", "blockquote", "div", "dl", "figcaption", "figure", "hr", "li",
                    "main", "ol", "p", "pre", "ul", "a", "abbr", "b", "br", "code", "data", "em", "i",
                    "mark", "span", "strong", "sub", "sup", "time", "u", "img",
                ],
                allowedAttributes: {
                    a: ["href", "name", "target"],
                    img: ["src"],
                    "*": ["class", "id"],
                },
            });
        }
        return html;
    }
    catch (error) {
        console.log(`[getHTML] Error:`, error instanceof Error ? error.message : error);
        if (retryCount < MAX_RETRIES) {
            console.log(`[getHTML] Retrying after error...`);
            await delay(RETRY_DELAY);
            return getHTML(baseUrl, pathname, ref, sanitize, retryCount + 1);
        }
        throw error;
    }
}
