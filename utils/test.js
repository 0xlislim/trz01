import puppeteer from "puppeteer";

export async function testChromiumBinary(chromiumBinary) {
    console.log(`Testing Chromium binary at: ${chromiumBinary}`);
    const browser = await puppeteer.launch({
        headless: true,
        executablePath: chromiumBinary,
    });
    console.log("Chromium binary is valid and usable!");
    await browser.close();
}