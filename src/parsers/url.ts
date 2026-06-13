import axios from "axios";
import * as cheerio from "cheerio";

export async function parseUrl(url: string, timeoutMs = 55000): Promise<string> {
  const response = await axios.get<string>(url, {
    timeout: timeoutMs,
    maxRedirects: 5,
  });
  const $ = cheerio.load(response.data);
  const text = $("body").text().replace(/\s+/g, " ").trim();
  return text;
}
