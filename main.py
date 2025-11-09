from fit_tool.fit_file import FitFile
from fit_tool.profile.messages.record_message import RecordMessage

def replace_hr_power(base_file_path, source_file_path, output_file_path):
    # Load FIT files
    base_fit = FitFile.from_file(base_file_path)
    source_fit = FitFile.from_file(source_file_path)

    # Extract HR and Power data from source
    source_data = {}
    for record in source_fit.records:
        message = record.message
        if isinstance(message, RecordMessage):
            ts = message.timestamp
            hr = message.heart_rate
            power = message.power
            source_data[ts] = (hr, power)
            
    # Replace HR and Power in base file (assume same number of record messages)
    i = 0
    for record in base_fit.records:
        message = record.message
        if isinstance(message, RecordMessage):
            ts = message.timestamp
            if ts in source_data:
                print(ts)
                hr, power = source_data[ts]
                if hr is not None:
                    message.heart_rate = hr
                #if power is not None:
                #    message.power = power
                i += 1
                
    print(i)

    # Write modified file
    base_fit.to_file(output_file_path)
    print(f"Written merged FIT file: {output_file_path}")


replace_hr_power("strava_091125.fit", "tymewear_091125.fit", "new.fit")
