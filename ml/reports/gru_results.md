# GRU Evaluation Results

## 1. Residuals identically computed for Calib and Val-Normal
**GRU Combined Score (Calib vs Val):**
- Mean: 0.8631 vs 0.8687
- Std:  0.1348 vs 0.1318
- P99:  1.1054 vs 1.1234

## 2. Calibrated Thresholds
- GRU = 1.1342
- Ridge = 1.0602

## 3. Val-Normal False Alerts (FAR)
| Model | Row FAR | Episodes/Day | Total Episodes (in 10.74 days) |
|---|---|---|---|
| Z-score | 0.006206 | 8.94 | 96 |
| GRU | 0.005753 | 0.84 | 9 |
| Ridge | 0.003878 | 0.84 | 9 |

## 4. GRU Full 80k Detection (Unmasked)
**False Alert Episodes outside faults: 24**

| Fault | Delay (rows) | Overlap | Top 3 Channels by Residual |
|---|---|---|---|
| F1 | 11 | 1/3 | `eps_temperature_C`, `imu_accel_y_mps2`, `data_queue_MB` |
| F2 | 2 | 2/3 | `power_bus_voltage_V`, `solar_array_current_A`, `payload_power_W` |
| F3 | 3 | 3/3 | `reaction_wheel_speed_rpm`, `gyro_y_deg_s`, `gyro_z_deg_s` |
| F4 | 6 | 1/3 | `packet_loss_pct`, `eps_temperature_C`, `power_bus_voltage_V` |
| F5 | 8 | 2/3 | `radiation_rate_counts_s`, `packet_loss_pct`, `solar_array_current_A` |
| F6 | 54 | 1/3 | `battery_soc_pct`, `cpu_utilization_pct`, `memory_utilization_pct` |
| F7 | 2 | 2/3 | `imu_accel_x_mps2`, `imu_accel_y_mps2`, `battery_temperature_C` |
| F8 | 3 | 2/3 | `power_bus_voltage_V`, `power_bus_current_A`, `solar_array_current_A` |

**Mean Overlap:** 1.75

## 5. Robustness Check: 20% Random Masking at Inference
**Masked Channels:** `comm_rx_dbm`, `imu_accel_y_mps2`, `power_bus_voltage_V`, `imu_accel_x_mps2`
**False Alert Episodes outside faults: 14**

| Fault | Delay (rows) | Overlap | Top 3 Channels by Residual |
|---|---|---|---|
| F1 | 15 | 2/3 | `eps_temperature_C`, `payload_temperature_C`, `radiation_rate_counts_s` |
| F2 | 37 | 1/3 | `battery_temperature_C`, `solar_array_current_A`, `gyro_z_deg_s` |
| F3 | 3 | 3/3 | `reaction_wheel_speed_rpm`, `gyro_y_deg_s`, `gyro_z_deg_s` |
| F4 | 6 | 2/3 | `packet_loss_pct`, `eps_temperature_C`, `comm_tx_dbm` |
| F5 | 8 | 2/3 | `radiation_rate_counts_s`, `packet_loss_pct`, `solar_array_current_A` |
| F6 | 57 | 2/3 | `payload_power_W`, `solar_array_current_A`, `battery_soc_pct` |
| F7 | 2 | 1/3 | `gyro_x_deg_s`, `comm_tx_dbm`, `battery_temperature_C` |
| F8 | 3 | 1/3 | `power_bus_current_A`, `solar_array_current_A`, `radiation_rate_counts_s` |

**Mean Overlap:** 1.75

## 6. Targeted Masking (Masking #1 channel for Fault 1: `eps_temperature_C`)
**False Alert Episodes outside faults: 25**

| Fault | Delay (rows) | Overlap | Top 3 Channels by Residual |
|---|---|---|---|
| F1 | 15 | 1/3 | `payload_temperature_C`, `radiation_rate_counts_s`, `payload_power_W` |
| F2 | 2 | 2/3 | `power_bus_voltage_V`, `solar_array_current_A`, `payload_power_W` |
| F3 | 3 | 3/3 | `reaction_wheel_speed_rpm`, `gyro_y_deg_s`, `gyro_z_deg_s` |
| F4 | 6 | 1/3 | `packet_loss_pct`, `power_bus_voltage_V`, `gyro_y_deg_s` |
| F5 | 8 | 2/3 | `radiation_rate_counts_s`, `packet_loss_pct`, `solar_array_current_A` |
| F6 | 54 | 1/3 | `battery_soc_pct`, `cpu_utilization_pct`, `memory_utilization_pct` |
| F7 | 2 | 2/3 | `imu_accel_x_mps2`, `imu_accel_y_mps2`, `battery_temperature_C` |
| F8 | 3 | 2/3 | `power_bus_voltage_V`, `power_bus_current_A`, `solar_array_current_A` |

**Mean Overlap:** 1.75
