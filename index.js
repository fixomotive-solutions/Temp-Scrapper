const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

// Files to store processed data
const PROCESSED_HANUMBERS_FILE = path.join(__dirname, 'processed_hanumbers.json');
const PROCESSED_MODELS_FILE = path.join(__dirname, 'processed_models.json');

// List of makes to process
const MAKES_TO_PROCESS = ['Hyundai', 'Honda', 'Toyota', 'Skoda', 'Suzuki', 'Ford', 'Nissan', 'Chevrolet', 'Volvo'];
const YEAR_TO_PROCESS = '2020';

// Load processed HANumbers from file
async function loadProcessedHANumbers() {
    try {
        const data = await fs.readFile(PROCESSED_HANUMBERS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return [];
    }
}

// Save processed HANumbers to file
async function saveProcessedHANumbers(haNumbers) {
    await fs.writeFile(PROCESSED_HANUMBERS_FILE, JSON.stringify(haNumbers, null, 2), 'utf8');
}

// Load processed models from file
async function loadProcessedModels() {
    try {
        const data = await fs.readFile(PROCESSED_MODELS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return [];
    }
}

// Save processed models to file
async function saveProcessedModels(models) {
    await fs.writeFile(PROCESSED_MODELS_FILE, JSON.stringify(models, null, 2), 'utf8');
}

// Check if model is already processed
function isModelProcessed(processedModels, year, make, model, engine) {
    return processedModels.some(m => 
        m.year === year && 
        m.make === make && 
        m.model === model && 
        m.engine === engine
    );
}

// Extract HANumber from URL
function extractHANumber(url) {
    const match = url.match(/HANumber=(\d+)/);
    return match ? match[1] : null;
}

async function loginToIdentifix() {
    console.log('Launching browser...');

    // Load processed data at start
    let processedHANumbers = await loadProcessedHANumbers();
    let processedModels = await loadProcessedModels();
    console.log(`Loaded ${processedHANumbers.length} previously processed HANumbers`);
    console.log(`Loaded ${processedModels.length} previously processed models`);

    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        args: ['--start-maximized']
    });

    try {
        const page = await browser.newPage();
        
        // Set default navigation timeout to 90 seconds
        page.setDefaultNavigationTimeout(90000);
        page.setDefaultTimeout(90000);

        console.log('Navigating to Identifix login page...');
        await page.goto('https://dh.identifix.com/Default/LogOnIdentifix', {
            waitUntil: 'networkidle2',
            timeout: 90000
        });

        console.log('Page loaded. Waiting for login form...');

        await page.waitForSelector('input[name="UserName"], input[type="text"], #UserName', {
            visible: true,
            timeout: 30000
        });

        console.log('Filling in username...');
        await page.type('input[name="UserName"], input[type="text"], #UserName', 'KhirveJ7', {
            delay: 100
        });

        console.log('Filling in password...');
        await page.type('input[name="Password"], input[type="password"], #Password', 'GLADIATOR', {
            delay: 100
        });

        console.log('Clicking login button...');
        await page.click('#Login');

        console.log('Waiting for navigation after login...');
        await page.waitForNavigation({
            waitUntil: 'networkidle2',
            timeout: 60000
        }).catch(() => {
            console.log('Navigation timeout - checking if login was successful...');
        });

        const currentUrl = page.url();
        console.log('Current URL after login attempt:', currentUrl);
        console.log('Login successful! Now proceeding to vehicle selection...');

        await page.waitForSelector('#ddlVehicleYear', { visible: true, timeout: 30000 });
        console.log('Vehicle selection page loaded.');

        // Loop through all makes
        for (const make of MAKES_TO_PROCESS) {
            console.log(`\n\n========== PROCESSING MAKE: ${make} ==========\n`);

            // Select year
            console.log(`Selecting year ${YEAR_TO_PROCESS}...`);
            await page.select('#ddlVehicleYear', YEAR_TO_PROCESS);
            await page.waitForTimeout(5000);

            // Select make
            console.log(`Selecting make: ${make}...`);
            await page.waitForSelector('#ddlVehicleMake', { visible: true });
            await page.select('#ddlVehicleMake', make);
            await page.waitForTimeout(5000);

            // Get all models for this make
            const modelOptions = await page.$$eval('#ddlVehicleModel option', options =>
                options.map(option => ({
                    value: option.value,
                    text: option.textContent
                })).filter(opt => opt.value !== '' && opt.value !== '0')
            );
            console.log(`Found ${modelOptions.length} models for ${make} ${YEAR_TO_PROCESS}`);

            // Loop through all models
            for (let i = 1; i < modelOptions.length; i++) {
                const modelOption = modelOptions[i];
                const modelValue = modelOption.value;
                const modelText = modelOption.text;

                console.log(`\n--- Processing Model ${i + 1}/${modelOptions.length}: ${modelText} ---`);

                await page.select('#ddlVehicleModel', modelValue);
                await page.waitForTimeout(5000);

                // Get all engines for this model
                const engineOptions = await page.$$eval('#ddlVehicleEngine option', options =>
                    options.map(option => ({
                        value: option.value,
                        text: option.textContent
                    })).filter(opt => opt.value !== '' && opt.value !== '0')
                );
                console.log(`Found ${engineOptions.length} engines for ${modelText}`);

                // Loop through all engines
                for (let j = 0; j < engineOptions.length; j++) {
                    const engineOption = engineOptions[j];
                    const engineValue = engineOption.value;
                    const engineText = engineOption.text;

                    console.log(`  Engine ${j + 1}/${engineOptions.length}: ${engineText}`);

                    // Check if this combination is already processed
                    if (isModelProcessed(processedModels, YEAR_TO_PROCESS, make, modelText, engineText)) {
                        console.log(`  ⏭️  SKIPPING: Already processed (${YEAR_TO_PROCESS} ${make} ${modelText} ${engineText})`);
                        continue;
                    }

                    await page.select('#ddlVehicleEngine', engineValue);

                    console.log('  Waiting 2 seconds...');
                    await page.waitForTimeout(2000);

                    console.log('  Clicking SelectVehicle button...');
                    await page.click('#btnSelectVehicle');

                    await page.waitForTimeout(10000);

                    await page.click('li[tab-value="FixData"]');

                    await page.waitForTimeout(2000);

                    await page.waitForSelector('.tab-link-list a', { timeout: 30000 });

                    console.log('  Clicking Hotline Archives link...');
                    await page.evaluate(() => {
                        const hotlineLink = Array.from(document.querySelectorAll('.tab-link-list a'))
                            .find(link => link.textContent.trim() === 'Hotline Archives');

                        if (hotlineLink) {
                            hotlineLink.click();
                        }
                    });

                    await page.waitForTimeout(10000);

                    const systemLinkUrls = await page.$$eval('a.symptom-link.document-link', links =>
                        links.map(link => link.href)
                    );

                    console.log(`  Found ${systemLinkUrls.length} URLs`);

                    // Process all URLs for this engine
                    for (let k = 0; k < systemLinkUrls.length; k++) {
                        const url = systemLinkUrls[k];
                        
                        const haNumber = extractHANumber(url);
                        
                        if (haNumber) {
                            if (processedHANumbers.includes(haNumber)) {
                                console.log(`    URL ${k + 1}: Skipping HANumber ${haNumber} (already processed)`);
                                continue;
                            }
                            console.log(`    URL ${k + 1}: Processing HANumber ${haNumber}`);
                        } else {
                            console.log(`    URL ${k + 1}: No HANumber found in URL`);
                        }

                        // Increased timeout for individual page navigation
                        await page.goto(url, { 
                            waitUntil: 'networkidle2',
                            timeout: 90000
                        });
                        await page.waitForTimeout(5000);

                        const data = await page.evaluate(() => {
                            const vehicleInfo = document.querySelector('.vehicle-info');
                            const contentDiv = document.querySelector('.html-details-body-div-content');
                            
                            return {
                                vehicleInfo: vehicleInfo ? vehicleInfo.textContent.trim() : 'unknown',
                                content: contentDiv ? contentDiv.innerHTML : ''
                            };
                        });
                        
                        const safeFileName = data.vehicleInfo
                            .replace(/[^a-z0-9]/gi, '_')
                            .replace(/_+/g, '_')
                            .substring(0, 100);
                        
                        const fileName = haNumber 
                            ? `HANumber_${haNumber}_${safeFileName}.html`
                            : `${safeFileName}_${k + 1}.html`;
                        
                        const filePath = path.join(__dirname, 'output', fileName);
                        
                        await fs.mkdir(path.join(__dirname, 'output'), { recursive: true });
                        await fs.writeFile(filePath, data.content, 'utf8');
                        console.log(`      Saved to: ${fileName}`);

                        // Add HANumber to processed list and save
                        if (haNumber) {
                            processedHANumbers.push(haNumber);
                            await saveProcessedHANumbers(processedHANumbers);
                            console.log(`      Added HANumber ${haNumber} to processed list`);
                        }

                        await page.waitForTimeout(10000);
                    }

                    // Mark this model+engine combination as processed
                    const modelRecord = {
                        year: YEAR_TO_PROCESS,
                        make: make,
                        model: modelText,
                        engine: engineText,
                        processedAt: new Date().toISOString(),
                        urlsProcessed: systemLinkUrls.length
                    };
                    processedModels.push(modelRecord);
                    await saveProcessedModels(processedModels);
                    console.log(`  ✅ Marked as processed: ${YEAR_TO_PROCESS} ${make} ${modelText} ${engineText}`);

                    // Navigate back to vehicle selection with increased timeout
                    await page.goto('https://dh.identifix.com/CreateVehicle/Index?LocationId=13', { 
                        waitUntil: 'networkidle2',
                        timeout: 90000
                    });

                    console.log('  Waiting 20 seconds before next selection...');
                    await page.waitForTimeout(20000);

                    // Re-select year, make, and model for next iteration
                    const needsReselection = await page.$('#ddlVehicleYear');
                    if (needsReselection) {
                        console.log('  Re-selecting year, make, and model...');
                        await page.select('#ddlVehicleYear', YEAR_TO_PROCESS);
                        await page.waitForTimeout(1000);
                        await page.select('#ddlVehicleMake', make);
                        await page.waitForTimeout(1000);
                        await page.select('#ddlVehicleModel', modelValue);
                        await page.waitForTimeout(1000);
                    }
                }
            }

            console.log(`\n========== COMPLETED MAKE: ${make} ==========\n`);
        }

        console.log('\n\n=== ALL MAKES AND MODELS PROCESSED! ===');
        console.log(`Total HANumbers processed: ${processedHANumbers.length}`);
        console.log(`Total model combinations processed: ${processedModels.length}`);
        console.log('Press Ctrl+C to close the browser and exit.');

        await new Promise(() => { });

    } catch (error) {
        console.error('Error during login process:', error.message);
        await browser.close();
        process.exit(1);
    }
}

loginToIdentifix().catch(console.error);