# Data Audit Report

## 1. Per-Signal Range, Mean, and Standard Deviation (Clean Data)
| Signal | Mean | Std | Min | Max |
|---|---|---|---|---|
| power_bus_voltage_V | 28.2227 | 0.1672 | 25.0847 | 30.4273 |
| power_bus_current_A | 4.5024 | 0.3862 | 1.8898 | 7.1787 |
| solar_array_current_A | 3.0002 | 0.4357 | 2.0692 | 3.9708 |
| battery_soc_pct | 77.0013 | 4.9891 | 61.4454 | 85.4240 |
| battery_temperature_C | 22.0065 | 1.9886 | 18.5753 | 25.4430 |
| eps_temperature_C | 24.0063 | 2.2751 | 20.0666 | 31.5447 |
| payload_temperature_C | 19.0036 | 1.5653 | 16.0713 | 23.6479 |
| radiator_temperature_C | 12.0006 | 1.4232 | 9.4408 | 14.5709 |
| imu_accel_x_mps2 | 0.0002 | 0.0220 | -0.0724 | 0.2587 |
| imu_accel_y_mps2 | -0.0003 | 0.0215 | -0.2237 | 0.0766 |
| imu_accel_z_mps2 | 9.8100 | 0.0207 | 9.7318 | 9.8901 |
| gyro_x_deg_s | 0.0002 | 0.0607 | -0.3219 | 0.4332 |
| gyro_y_deg_s | 0.0000 | 0.0537 | -0.3634 | 0.2460 |
| gyro_z_deg_s | -0.0000 | 0.0409 | -0.2132 | 0.2861 |
| reaction_wheel_speed_rpm | 1800.0958 | 186.6168 | 1410.3330 | 2599.8551 |
| comm_rx_dbm | -78.0053 | 1.5541 | -91.3229 | -73.7442 |
| comm_tx_dbm | -4.0019 | 0.5628 | -8.6502 | -2.3785 |
| packet_loss_pct | 0.4834 | 0.1894 | 0.1819 | 7.4872 |
| cpu_utilization_pct | 52.0214 | 5.5420 | 36.5621 | 81.0033 |
| memory_utilization_pct | 48.0553 | 5.0926 | 37.0395 | 60.1251 |
| radiation_rate_counts_s | 7.9604 | 0.6247 | 5.7310 | 26.7735 |
| payload_power_W | 58.0269 | 5.3286 | 44.1712 | 90.3338 |
| data_queue_MB | 180.2804 | 32.9386 | 102.9480 | 334.4131 |

## 2. Missing Percentage (Imperfect Data)
| Column | Missing % |
|---|---|
| power_bus_voltage_V | 0.80% |
| power_bus_current_A | 0.80% |
| solar_array_current_A | 0.80% |
| battery_soc_pct | 0.80% |
| battery_temperature_C | 0.80% |
| eps_temperature_C | 0.80% |
| payload_temperature_C | 0.80% |
| radiator_temperature_C | 0.80% |
| imu_accel_x_mps2 | 0.80% |
| imu_accel_y_mps2 | 0.80% |
| imu_accel_z_mps2 | 0.80% |
| gyro_x_deg_s | 0.80% |
| gyro_y_deg_s | 0.80% |
| gyro_z_deg_s | 0.80% |
| reaction_wheel_speed_rpm | 0.80% |
| comm_rx_dbm | 0.80% |
| comm_tx_dbm | 0.80% |
| packet_loss_pct | 0.80% |
| cpu_utilization_pct | 0.80% |
| memory_utilization_pct | 0.80% |
| radiation_rate_counts_s | 0.80% |
| payload_power_W | 0.80% |
| data_queue_MB | 0.80% |

## 3. Fault Rows Analysis
Are fault rows inside the clean file or only described by start_row/end_row?
Based on the analysis, the fault rows are present in the clean data file at the specified `start_row`/`end_row` indices, not just described in the ground truth file.

## 4. Mode Column Partitioning
The `mode` column partitions the rows as follows:
- **NOMINAL**: 20160 rows (25.2%)
- **HIGH_LOAD**: 20160 rows (25.2%)
- **SAFE**: 20160 rows (25.2%)
- **COMM**: 19520 rows (24.4%)

## 5. Timestamp Spacing
Timestamps are generally spaced by **0 days 00:01:00**.

## 6. Out-of-Order and Delay in Imperfect File
In the imperfect file, there are **0** instances where a row's timestamp is earlier than the previous row (out-of-order).
Delay is represented by missing or duplicated timestamps, or timestamps that jump forward unexpectedly and then backfill.

## 7. Assumptions & Uncertainties
- Assumed that the clean file contains the actual faults during the `start_row` to `end_row` periods, and the 'imperfect' file just adds transmission noise/delays.
- Assumed `timestamp` is the sole source of truth for ordering in the imperfect file despite potential delays.