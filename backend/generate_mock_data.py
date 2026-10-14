import os
import pandas as pd
import numpy as np

def main():
    # Create DATA directory at the project root
    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    data_dir = os.path.join(root_dir, "DATA")
    os.makedirs(data_dir, exist_ok=True)

    print(f"Generating mock data in: {data_dir}")

    # Generate hospital.csv
    hospitals = []
    bed_categories = ["<100", "100 - 249", "250 - 499", "500 - 999", ">= 1000"]
    regions = ["Midwest", "Northeast", "South", "West"]

    for i in range(1, 31):
        hospitals.append({
            "hospitalid": i,
            "numbedscategory": bed_categories[i % len(bed_categories)],
            "teachingstatus": i % 2,  # 1 or 0
            "region": regions[i % len(regions)]
        })

    df_hospital = pd.DataFrame(hospitals)
    df_hospital.to_csv(os.path.join(data_dir, "hospital.csv"), index=False)

    # Generate patient.csv and apachepatientresult.csv
    # We need at least 3 years (e.g. 2020, 2021, 2022) to have >= 2 transitions
    patients = []
    apache_results = []
    patient_id = 1

    np.random.seed(42)  # For reproducible mock data

    for hosp_id in range(1, 31):
        for year in [2020, 2021, 2022]:
            # Generate 50 mock patients per hospital per year
            for _ in range(50):
                stay_offset = int(np.random.randint(1440, 14400)) # 1 to 10 days
                patients.append({
                    "patientunitstayid": patient_id,
                    "hospitalid": hosp_id,
                    "hospitaldischargeyear": year,
                    "unitdischargeoffset": stay_offset
                })
                # acute physiology score between 10 and 150
                apache_results.append({
                    "patientunitstayid": patient_id,
                    "acutephysiologyscore": float(np.random.randint(10, 150))
                })
                patient_id += 1

    df_patient = pd.DataFrame(patients)
    df_patient.to_csv(os.path.join(data_dir, "patient.csv"), index=False)

    df_apache = pd.DataFrame(apache_results)
    df_apache.to_csv(os.path.join(data_dir, "apachepatientresult.csv"), index=False)

    print("Mock data files created successfully:")
    print(f"  - {os.path.join(data_dir, 'hospital.csv')}")
    print(f"  - {os.path.join(data_dir, 'patient.csv')}")
    print(f"  - {os.path.join(data_dir, 'apachepatientresult.csv')}")

if __name__ == "__main__":
    main()
