// Load modules and constants
const { RateLimit } = require('async-sema');
const fs = require("fs");
const fetch = require("node-fetch");
const BASEDIR = process.cwd();
const { FOLDERS } = require(`${BASEDIR}/constants/folders.js`);
const { ACCOUNT_DETAILS } = require(`${FOLDERS.constantsDir}/account_details.js`);
const { fetchWithRetry } = require(`${FOLDERS.modulesDir}/fetchWithRetry.js`);

// Check if the uploadGenericMeta value in account_details.js is set to true. If it is the case read data from genericJSONDir directory, otherwise read from jsonDir directory
var readDir ;
if (ACCOUNT_DETAILS.uploadGenericMeta) {
  readDir = (`${FOLDERS.genericJSONDir}`);
} else {
  readDir = (`${FOLDERS.jsonDir}`);
}
const re = new RegExp("^([0-9]+).json$"); // Will be used to ensure only JSON files from the JSONDIR is used in the meta's updated.
const TIMEOUT = Number(ACCOUNT_DETAILS.timeout); // Milliseconds. Extend this if needed to wait for each upload. 1000 = 1 second.
const limit = RateLimit(Number(ACCOUNT_DETAILS.max_rate_limit)); // Ratelimit for your APIKey
const allMetadata = [];

// Grab the current date and time to create a backup directory
let date_ob = new Date();
const backupDate = date_ob.getFullYear() + "_" + ("0" + (date_ob.getMonth() + 1)).slice(-2) + "_" + ("0" + date_ob.getDate()).slice(-2) + "_" + date_ob.getHours() + "_" + date_ob.getMinutes() + "_" + date_ob.getSeconds();

// Check if the ipfsMetasDir directory exists and if not, then create it.
if (!fs.existsSync(`${FOLDERS.ipfsMetasDir}`)) {
  fs.mkdirSync(`${FOLDERS.ipfsMetasDir}`);
}

// Check if the backupDir directory exists and if not, then create it.
if (!fs.existsSync(`${FOLDERS.backupDir}`)) {
  fs.mkdirSync(`${FOLDERS.backupDir}`);
}

// Check if the backupJSONDir directory exists and if not, then create it.
if (!fs.existsSync(`${FOLDERS.backupJSONDir}`)) {
  fs.mkdirSync(`${FOLDERS.backupJSONDir}`);
}

// Check if a backupDate directory already exists and if not, then create it.
if (!fs.existsSync(`${FOLDERS.backupJSONDir}/${backupDate}_meta`)) {
  fs.mkdirSync(`${FOLDERS.backupJSONDir}/${backupDate}_meta`);
}

// Make a copy of the _metadata.json file into the backupDate_meta directory.
fs.copyFileSync(`${readDir}/_metadata.json`, `${FOLDERS.backupJSONDir}/${backupDate}_meta/_metadata.json`);
console.log(`Backed up ${readDir}/_metadata.json to ${FOLDERS.backupJSONDir}/${backupDate}_meta/_metadata.json before starting process.`);

// Main function - called asynchronously
async function main() {

  // Load the list of file names from the readDir directory and sort them numerically
  const files = fs.readdirSync(readDir);
  files.sort(function(a, b){
    return a.split(".")[0] - b.split(".")[0];
  });

  // Loop through each file in the list.
  for (const file of files) {
    
    if (re.test(file)) {
      // Load the json file and parse it as JSON
      let jsonFile = fs.readFileSync(`${readDir}/${file}`);
      let metaData = JSON.parse(jsonFile);

      // Create a new filename for a file that will be created in the ipfsMetasDir directory.
      const uploadedMeta = `${FOLDERS.ipfsMetasDir}/${metaData.custom_fields.edition}.json`;

      try {

        // Access the file and if it can be found, load the file.
        fs.accessSync(uploadedMeta);
        const uploadedMetaFile = fs.readFileSync(uploadedMeta)

        // Check if the file is not empty and proceed to try and parse the file
        if(uploadedMetaFile.length > 0) {

          // Parse the file as JSON  
          const ipfsMeta = JSON.parse(uploadedMetaFile)

          // Check if the file's response field is not equal to  OK and if this is true, then throw an exception and go to the catch section to upload again.
          if(ipfsMeta.response !== "OK") throw 'metadata not uploaded'

          // If response was OK, then add the file's json object to the allMetadata array.
          allMetadata.push(ipfsMeta);
          console.log(`${metaData.name} metadata already uploaded`);

        } // File is empty, need to upload metadata. Will go to the catch section.
          else {

          // Throw exception to begin uploading process.
          throw 'metadata not uploaded'
        }
      } catch(err) {
        try {

          // Apply rate limit that was set in the account_details.js file
          await limit()

          // Setup the API details
          let options = {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: ACCOUNT_DETAILS.auth,
            },
            body: jsonFile,
          };

          // Call the fetchWithRetry function that will perform the API call
          const response = await fetchWithRetry("https://api.nftport.xyz/v0/metadata", options);

          // Add the response JSON object to the allMetadata array.
          allMetadata.push(response);

          // Write the response JSON object to the ipfsMetasDir directory
          fs.writeFileSync(`${uploadedMeta}`, JSON.stringify(response, null, 2));

          console.log(`${response.name} metadata uploaded!`);

        } catch(err) {
          console.log(`Catch: ${err}`)
        }
      }

      // Write the allMetadata array to the ipfsMetasDir directory
      fs.writeFileSync(`${FOLDERS.ipfsMetasDir}/_ipfsMetas.json`,JSON.stringify(allMetadata, null, 2));
      
    }
  }
}

// Start the main process.
main();

// timer function - This function is used to add a timeout in between actions.
function timer(ms) {
  return new Promise(res => setTimeout(res, ms));
}