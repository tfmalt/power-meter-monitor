/**
 * A simple arduinio program that reads the state of a photosensor as 
 * quickly as it is able to.
 * 
 * If the state is HIGH a led is on. Led on signals the start of a 
 * pulse - or imp - on the power meter. When the state goes from HIGH 
 * to LOW again it means the pulse has come to an end. The pulse counter
 * is increased and the loop waits for a new pulse to start. On my 
 * power meter 10000 imps equals 1 kWh.
 * 
 * Approximately every second the pulse count is sent over the serial
 * wire as a small serialized JSON object, for a program at the other
 * end to pick up.
 * 
 * @author Thomas Malt <thomas@malt.no>
 * @copyright 2013 (c) Thomas Malt <thomas@malt.no>
 * 
 */
#include "Timer.h"

Timer t;

const int sensorPin = 2;
int ledPin, ledMax; 
int ledPins[] = {4,5,6,7,8,9,10,11,12,13};

unsigned long counter, kwhCounter;
boolean light, inPulse;
  
void setup()
{
    counter    = 0;
    kwhCounter = 0;
    light      = LOW;
    inPulse    = false;
    ledPin     = 0;
    ledMax     = 10;

    int i;
    for (i = ledPin; i < ledMax; i++)
    {
        pinMode(ledPins[i], OUTPUT);
    }

    int tickEvent = t.every(1000, sendUpdate, (void*)2);

    Serial.begin(115200);
    Serial.flush();
    Serial.println("                                                        ");
    Serial.println("                                                        ");
    Serial.println("{\"BEGIN\": 1}");
    Serial.flush();
}

void loop()
{
    light = digitalRead(sensorPin);

    if (light == HIGH) {
        if (inPulse == false) {
            startPulse();
        }
    } else {
        if (inPulse == true) {
            endPulse();
            setLeds();
        }
    }

    t.update();
}

void startPulse() 
{
    inPulse    = true;
}

void endPulse() 
{
    inPulse = false;
    counter++;
    kwhCounter++;
}

void setLeds() 
{
    int binCounter = map(kwhCounter, 0, 10000, 0, 1023);
    int pin = 0;

    while (binCounter > 0) 
    {
        digitalWrite(ledPins[pin], (binCounter%2) ? HIGH : LOW);
        binCounter = binCounter/2;
        pin++;
    }

    while (pin < ledMax) {
        digitalWrite(ledPins[pin], LOW);
        pin++;
    }

    if (kwhCounter > 10000)
    {
        kwhCounter = 0;
    }
}


void sendUpdate(void* context) 
{
    Serial.print("{");
    Serial.print("\"pulseCount\": \"");
    Serial.print(counter);
    Serial.print("\", \"ledPin\": \"");
    Serial.print(ledPin);
    Serial.println("\"}");

    counter     = 0;
}


/*
 * MIT LICENSE
 * 
 * Copyright (C) 2013 Thomas Malt <thomas@malt.no>
 * 
 * Permission is hereby granted, free of charge, to any person obtaining 
 * a copy of this software and associated documentation files (the 
 * "Software"), to deal in the Software without restriction, including 
 * without limitation the rights to use, copy, modify, merge, publish, 
 * distribute, sublicense, and/or sell copies of the Software, and to permit 
 * persons to whom the Software is furnished to do so, subject to the 
 * following conditions:
 * 
 * The above copyright notice and this permission notice shall be included 
 * in all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS 
 * OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF 
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. 
 * IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY 
 * CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, 
 * TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE
 * OR THE USE OR OTHER DEALINGS IN THE SOFTWARE. 
 */
