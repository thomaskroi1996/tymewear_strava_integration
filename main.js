const fs = require("fs");
const fit = require("@garmin/fitsdk");

// Helper: convert JS Date to FIT timestamp (seconds since FIT epoch)
function dateToFitSeconds(date) {
  // FIT epoch: 1989-12-31 00:00:00 UTC
  const fitEpoch = new Date("1989-12-31T00:00:00Z").getTime();
  return Math.floor((date.getTime() - fitEpoch) / 1000);
}

// Read a FIT file and extract timestamp → HR/power mapping
function readSourceData(sourcePath) {
  const buffer = fs.readFileSync(sourcePath);
  const fitDecoder = new fit.Decoder();
  fitDecoder.setData(buffer);

  const sourceData = {};

  fitDecoder.decode();
  const messages = fitDecoder.getMessages();

  messages.forEach((mesg) => {
    if (mesg.name === "record") {
      const ts = mesg.getField("timestamp")?.value;
      if (ts !== undefined) {
        const hr = mesg.getField("heart_rate")?.value ?? null;
        const pw = mesg.getField("power")?.value ?? null;
        sourceData[ts] = { hr, pw };
      }
    }
  });

  return sourceData;
}

// Merge base with source HR/power
function mergeFit(basePath, sourcePath, outputPath) {
  const baseBuffer = fs.readFileSync(basePath);
  const fitDecoder = new fit.Decoder();
  fitDecoder.setData(baseBuffer);
  fitDecoder.decode();
  const baseMessages = fitDecoder.getMessages();

  // Source mapping
  const sourceData = readSourceData(sourcePath);

  // Create new FIT encoder
  const encoder = new fit.Encoder();
  encoder.addFileIdMesg({
    manufacturer: fit.Manufacturer.garmin,
    product: 1234,
    serial_number: 1,
  });

  baseMessages.forEach((mesg) => {
    if (mesg.name === "record") {
      // Create a new record mesg
      const record = new fit.RecordMesg();

      // Copy all existing fields from base
      mesg.fields.forEach((field) => {
        record.setFieldValue(field.defNum, field.value);
      });

      // Replace or add HR/power from source
      const ts = mesg.getField("timestamp")?.value;
      if (ts !== undefined && sourceData[ts]) {
        const { hr, pw } = sourceData[ts];
        if (hr !== null) record.setHeartRate(hr);
        if (pw !== null) record.setPower(pw);
      }

      encoder.write(record);
    } else {
      // Copy other messages unchanged
      encoder.write(mesg);
    }
  });

  // Save new FIT file
  fs.writeFileSync(outputPath, Buffer.from(encoder.getArrayBuffer()));
  console.log(`Merged FIT file written to ${outputPath}`);
}

// Example usage:
mergeFit("strava_091125.fit", "tymewear_091125.fit", "combined_js.fit");
