[ONLY FOR INITIALIZING FIRST HUB]
mosquitto_passwd -c ./passwd HUB-01

[ADDING HUBS]
mosquitto_passwd ./passwd HUB-02

[SETTING UP THE CONFIG]
listener 1883
allow_anonymous false
password_file ./passwd

[STARTING MOSQUITTO]
mosquitto -c ./mosquitto.conf -v

[SUBSCRIBING]
mosquitto_sub -h localhost -p 1883 -u <username> -P <password> -t "kage/#

Subscribe to the MQTT topic pattern kage/#

The # is a wildcard meaning:
everything underneath kage/

[PUBLISHING]
mosquitto_pub -h localhost -p 1883 -u <username> -P <password> -t "kage/hubs/HUB-01/status" -m "online"

Connect to the MQTT broker on localhost:1883, authenticate as HUB-01, then publish the message online to the topic kage/hubs/HUB-01/status.


[ALLOW THROUGH FIREWALL]
New-NetFirewallRule `
    -DisplayName "KAGE Mosquitto MQTT" `
    -Direction Inbound `
    -Protocol TCP `
    -LocalPort 1883 `
    -Action Allow