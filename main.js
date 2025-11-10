import { Decoder, Stream, Encoder, Profile, Utils } from "@garmin/fitsdk";
import fs from "fs";

function readSourceData(sourcePath) {
  // read the file into a Buffer
  const fileData = fs.readFileSync(sourcePath);
  const stream = Stream.fromBuffer(fileData);
  const decoder = new Decoder(stream);

  console.log("checkIntegrity: " + decoder.checkIntegrity());

  const { messages, errors } = decoder.read();

  const sourceData = {};

  // console.log(messages);

  const tymewear_mapping = {
    tyme_breath_rate: 0, // br/minute
    tyme_tidal_volume: 1, // vol per breath
    tyme_minute_volume: 2, // vol per minute
    tyme_heart_rate: 15,
    tyme_power: 16,
    tyme_ve_zone: 17,
  };

  for (const record of messages.recordMesgs) {
    const ts = record.timestamp;
    if (ts !== undefined) {
      const hr = record.heartRate;
      const pw = record.power;
      const br = record.developerFields[tymewear_mapping["tyme_breath_rate"]];
      const tv =
        record.developerFields[tymewear_mapping["tyme_tidal_volume"]];
      const mv =
        record.developerFields[tymewear_mapping["tyme_minute_volume"]];
      const t_hr =
        record.developerFields[tymewear_mapping["tyme_heart_rate"]];
      const t_power = record.developerFields[tymewear_mapping["tyme_power"]];
      const t_ve = record.developerFields[tymewear_mapping["tyme_ve_zone"]];
      const cadence = record.cadence;
      sourceData[ts] = { hr, pw, cadence, br, tv, mv, t_hr, t_power, t_ve };
    }
  }

  // console.log(sourceData);

  return sourceData;
}

function readBaseData(basePath) {
  const fileData = fs.readFileSync(basePath);
  const stream = Stream.fromBuffer(fileData);
  const fitDecoder = new Decoder(stream);

  console.log("isFIT:", Decoder.isFIT(stream));
  console.log("isFIT (instance):", fitDecoder.isFIT());
  console.log("checkIntegrity:", fitDecoder.checkIntegrity());

  const result = fitDecoder.read();

  return result;
}

// Merge base with source HR/power
function mergeFit(basePath, sourcePath, outputPath) {
  const result = readBaseData(basePath); // whole file object
  const sourceData = readSourceData(sourcePath); //dictionary

  // Create new FIT encoder
  const encoder = new Encoder();

  encoder.writeMesg({
    name: "file_id",
    fields: {
      type: 0, // activity
      manufacturer: 1,
      product: 1,
      time_created: new Date(),
    },
  });

  encoder.writeMesg({
    name: "developer_data_id",
    fields: {
      developer_data_index: 0,
      application_id: [1, 2, 3, 4, 5, 6, 7, 8],
    },
  });

  const customFields = ["br", "tv", "mv", "t_ve"];
  customFields.forEach((name, i) => {
    encoder.writeMesg({
      name: "field_description",
      fields: {
        developer_data_index: 0, // matches your developerFields index
        field_definition_number: i, // assign sequential numbers
        fit_base_type_id: 132, // uint32, adjust if needed
        field_name: name,
        units: "",
      },
    });
  });

  // loop over records
  // add HR and power from tymwear, as well as breathing metrics
  let n = 0;
  for (const recordMsg of result["messages"].recordMesgs) {
    if (recordMsg.heartRate) {
      if (sourceData[recordMsg.timestamp]) {
        const recordMsgNew = {
          name: "record",
          fields: {
            timestamp: recordMsg.timestamp,
            heart_rate: sourceData[recordMsg.timestamp]["hr"],
            power: sourceData[recordMsg.timestamp]["pw"],
            cadence: sourceData[recordMsg.timestamp]["cadence"],
          },
          developerFields: {
            0: {
              br: sourceData[recordMsg.timestamp]["br"],
              tv: sourceData[recordMsg.timestamp]["tv"],
              mv: sourceData[recordMsg.timestamp]["mv"],
              t_ve: sourceData[recordMsg.timestamp]["t_ve"],
            },
          },
        };
        encoder.writeMesg(recordMsgNew);
      } else {
        const recordMsgNew = {
          name: "record",
          fields: {
            timestamp: recordMsg.timestamp,
            heart_rate: 0,
            power: 0,
            cadence: 0,
          },
          developerFields: {
            0: {
              br: 0,
              tv: 0,
              mv: 0,
              t_ve: 0,
            },
          },
        };
        encoder.writeMesg(recordMsgNew);
      }

      if (n < 1000) console.log(recordMsg, recordMsg.timestamp);
      n++;
    } else {
      // else it is just latitude and longitude information and we have to copy that as well
    }

    // encoder.writeMesg(recordMsg);
  }

  const output = encoder.finish();
  fs.writeFileSync(outputPath, Buffer.from(output));

  console.log("number of tymewear timestamps in strava file: ", n);
  console.log(`Merged FIT file written to ${outputPath}`);
}

// Example usage:
mergeFit("strava_091125.fit", "tymewear_091125.fit", "combined_js.fit");
