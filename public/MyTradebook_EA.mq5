//+------------------------------------------------------------------+
//|                                              MyTradebook_EA.mq5  |
//|                                    Auto-sync trades to MyTradebook|
//+------------------------------------------------------------------+
#property copyright "MyTradebook"
#property version   "1.00"
#property description "Automatically sends trade data to MyTradebook journal"

input string   ApiKey = "";                // Your API Key (from MyTradebook Accounts page)
input string   ServerURL = "";             // Your MyTradebook URL (e.g. http://127.0.0.1:5000)
input int      SyncIntervalSeconds = 5;    // How often to check for changes (seconds)
input int      HistoryDaysBack = 0;        // 0 = full available history, >0 = last N days on first sync
input bool     SendAccountInfo = true;     // Send account balance/equity updates

string         baseUrl;
datetime       lastCheck;
int            knownPositions[];
int            knownDeals[];
datetime       lastAccountSync;

int OnInit()
{
   if(ApiKey == "" || ServerURL == "")
   {
      Alert("MyTradebook EA: Please set your API Key and Server URL in the EA inputs!");
      return INIT_PARAMETERS_INCORRECT;
   }

   baseUrl = ServerURL;
   if(StringGetCharacter(baseUrl, StringLen(baseUrl)-1) == '/')
      baseUrl = StringSubstr(baseUrl, 0, StringLen(baseUrl)-1);

   lastCheck = 0;
   lastAccountSync = 0;

   string testUrl = baseUrl + "/api/webhook/trades";
   string allowedUrl = baseUrl;
   Print("MyTradebook EA: Initialized. Webhook URL: ", testUrl);
   Print("MyTradebook EA: IMPORTANT - Add '", allowedUrl, "' to Tools > Options > Expert Advisors > Allow WebRequest for listed URL");

   EventSetTimer(SyncIntervalSeconds);

   SyncAllPositions();
   SyncRecentHistory();
   if(SendAccountInfo) SendAccountUpdate();

   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   EventKillTimer();
}

void OnTimer()
{
   SyncAllPositions();
   SyncRecentHistory();

   if(SendAccountInfo && TimeCurrent() - lastAccountSync >= 60)
   {
      SendAccountUpdate();
      lastAccountSync = TimeCurrent();
   }
}

void OnTradeTransaction(const MqlTradeTransaction& trans,
                         const MqlTradeRequest& request,
                         const MqlTradeResult& result)
{
   if(trans.type == TRADE_TRANSACTION_DEAL_ADD)
   {
      Sleep(500);
      SyncAllPositions();
      SyncRecentHistory();
      if(SendAccountInfo) SendAccountUpdate();
   }
}

void SyncAllPositions()
{
   int total = PositionsTotal();

   for(int i = 0; i < total; i++)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;

      string symbol = PositionGetString(POSITION_SYMBOL);
      long posType = PositionGetInteger(POSITION_TYPE);
      double openPrice = PositionGetDouble(POSITION_PRICE_OPEN);
      double volume = PositionGetDouble(POSITION_VOLUME);
      double profit = PositionGetDouble(POSITION_PROFIT);
      double commission = PositionGetDouble(POSITION_COMMISSION) != 0 ? PositionGetDouble(POSITION_COMMISSION) : 0;
      double swap = PositionGetDouble(POSITION_SWAP);
      double sl = PositionGetDouble(POSITION_SL);
      double tp = PositionGetDouble(POSITION_TP);
      datetime openTime = (datetime)PositionGetInteger(POSITION_TIME);
      string comment = PositionGetString(POSITION_COMMENT);

      string typeStr = (posType == POSITION_TYPE_BUY) ? "BUY" : "SELL";

      string json = "{";
      json += "\"action\":\"TRADE_OPEN\",";
      json += "\"ticket\":\"" + IntegerToString(ticket) + "\",";
      json += "\"symbol\":\"" + symbol + "\",";
      json += "\"type\":\"" + typeStr + "\",";
      json += "\"openTime\":\"" + TimeToString(openTime, TIME_DATE|TIME_SECONDS) + "\",";
      json += "\"openPrice\":" + DoubleToString(openPrice, 5) + ",";
      json += "\"volume\":" + DoubleToString(volume, 2) + ",";
      json += "\"profit\":" + DoubleToString(profit, 2) + ",";
      json += "\"commission\":" + DoubleToString(commission, 2) + ",";
      json += "\"swap\":" + DoubleToString(swap, 2) + ",";
      if(sl > 0) json += "\"stopLoss\":" + DoubleToString(sl, 5) + ",";
      if(tp > 0) json += "\"takeProfit\":" + DoubleToString(tp, 5) + ",";
      if(comment != "") json += "\"comment\":\"" + comment + "\",";
      // Remove trailing comma
      if(StringGetCharacter(json, StringLen(json)-1) == ',')
         json = StringSubstr(json, 0, StringLen(json)-1);
      json += "}";

      SendWebhook(json);
   }
}

void SyncRecentHistory()
{
   datetime nowTime = TimeCurrent();
   datetime fromTime = 0;

   if(HistoryDaysBack > 0)
   {
      fromTime = nowTime - (datetime)HistoryDaysBack * 24 * 3600;
      if(fromTime < 0) fromTime = 0;
   }

   if(lastCheck > 0)
      fromTime = lastCheck - 3600;

   if(!HistorySelect(fromTime, nowTime))
   {
      Print("MyTradebook EA: HistorySelect failed for range ", TimeToString(fromTime, TIME_DATE), " to ", TimeToString(nowTime, TIME_DATE|TIME_SECONDS));
      return;
   }

   int totalDeals = HistoryDealsTotal();
   if(lastCheck == 0)
   {
      Print("MyTradebook EA: Initial history sync started. Deals in selected range: ", IntegerToString(totalDeals));
   }

   for(int i = 0; i < totalDeals; i++)
   {
      ulong dealTicket = HistoryDealGetTicket(i);
      if(dealTicket == 0) continue;

      long dealEntry = HistoryDealGetInteger(dealTicket, DEAL_ENTRY);
      long dealType = HistoryDealGetInteger(dealTicket, DEAL_TYPE);

      if(dealType == DEAL_TYPE_BALANCE) continue;

      if(dealEntry == DEAL_ENTRY_OUT || dealEntry == DEAL_ENTRY_OUT_BY || dealEntry == DEAL_ENTRY_INOUT)
      {
         long positionId = HistoryDealGetInteger(dealTicket, DEAL_POSITION_ID);
         string symbol = HistoryDealGetString(dealTicket, DEAL_SYMBOL);
         double closePrice = HistoryDealGetDouble(dealTicket, DEAL_PRICE);
         double profit = HistoryDealGetDouble(dealTicket, DEAL_PROFIT);
         double commission = HistoryDealGetDouble(dealTicket, DEAL_COMMISSION);
         double swap = HistoryDealGetDouble(dealTicket, DEAL_SWAP);
         double volume = HistoryDealGetDouble(dealTicket, DEAL_VOLUME);
         datetime closeTime = (datetime)HistoryDealGetInteger(dealTicket, DEAL_TIME);
         string comment = HistoryDealGetString(dealTicket, DEAL_COMMENT);

         double openPrice = 0;
         datetime openTime = 0;
         string typeStr = "";
         double sl = 0;
         double tp = 0;

         if(HistorySelectByPosition(positionId))
         {
            int posDeals = HistoryDealsTotal();
            for(int j = 0; j < posDeals; j++)
            {
               ulong entryDealTicket = HistoryDealGetTicket(j);
               if(entryDealTicket == 0) continue;

               long entryType = HistoryDealGetInteger(entryDealTicket, DEAL_ENTRY);
               if(entryType == DEAL_ENTRY_IN)
               {
                  openPrice = HistoryDealGetDouble(entryDealTicket, DEAL_PRICE);
                  openTime = (datetime)HistoryDealGetInteger(entryDealTicket, DEAL_TIME);
                  long dt = HistoryDealGetInteger(entryDealTicket, DEAL_TYPE);
                  typeStr = (dt == DEAL_TYPE_BUY) ? "BUY" : "SELL";
                  sl = HistoryDealGetDouble(entryDealTicket, DEAL_SL);
                  tp = HistoryDealGetDouble(entryDealTicket, DEAL_TP);

                  commission += HistoryDealGetDouble(entryDealTicket, DEAL_COMMISSION);
                  break;
               }
            }

            HistorySelect(fromTime, nowTime);
         }

         if(openPrice == 0 || openTime == 0 || typeStr == "") continue;

         string json = "{";
         json += "\"action\":\"TRADE_CLOSE\",";
         json += "\"ticket\":\"" + IntegerToString(positionId) + "\",";
         json += "\"symbol\":\"" + symbol + "\",";
         json += "\"type\":\"" + typeStr + "\",";
         json += "\"openTime\":\"" + TimeToString(openTime, TIME_DATE|TIME_SECONDS) + "\",";
         json += "\"closeTime\":\"" + TimeToString(closeTime, TIME_DATE|TIME_SECONDS) + "\",";
         json += "\"openPrice\":" + DoubleToString(openPrice, 5) + ",";
         json += "\"closePrice\":" + DoubleToString(closePrice, 5) + ",";
         json += "\"volume\":" + DoubleToString(volume, 2) + ",";
         json += "\"profit\":" + DoubleToString(profit, 2) + ",";
         json += "\"commission\":" + DoubleToString(commission, 2) + ",";
         json += "\"swap\":" + DoubleToString(swap, 2) + ",";
         if(sl > 0) json += "\"stopLoss\":" + DoubleToString(sl, 5) + ",";
         if(tp > 0) json += "\"takeProfit\":" + DoubleToString(tp, 5) + ",";
         json += "\"balance\":" + DoubleToString(AccountInfoDouble(ACCOUNT_BALANCE), 2) + ",";
         json += "\"equity\":" + DoubleToString(AccountInfoDouble(ACCOUNT_EQUITY), 2);
         if(comment != "") json += ",\"comment\":\"" + comment + "\"";
         json += "}";

         SendWebhook(json);
      }
   }

   lastCheck = nowTime;
}

void SendAccountUpdate()
{
   string json = "{";
   json += "\"action\":\"ACCOUNT_INFO\",";
   json += "\"balance\":" + DoubleToString(AccountInfoDouble(ACCOUNT_BALANCE), 2) + ",";
   json += "\"equity\":" + DoubleToString(AccountInfoDouble(ACCOUNT_EQUITY), 2) + ",";
   json += "\"currency\":\"" + AccountInfoString(ACCOUNT_CURRENCY) + "\",";
   json += "\"leverage\":\"" + IntegerToString(AccountInfoInteger(ACCOUNT_LEVERAGE)) + "\"";
   json += "}";

   SendWebhook(json);
}

bool SendWebhook(string jsonData)
{
   string url = baseUrl + "/api/webhook/trades";
   string headers = "Content-Type: application/json\r\nX-API-Key: " + ApiKey + "\r\n";

   char post[];
   StringToCharArray(jsonData, post, 0, INVALID_HANDLE, CP_UTF8);

   char result[];
   string resultHeaders;

   int timeout = 10000;
   int res = WebRequest("POST", url, headers, timeout, post, result, resultHeaders);

   if(res == -1)
   {
      int error = GetLastError();
      if(error == 4060)
      {
         Print("MyTradebook EA: WebRequest error - URL not allowed. Add '", baseUrl, "' to Tools > Options > Expert Advisors > Allow WebRequest");
      }
      else
      {
         Print("MyTradebook EA: WebRequest error ", error);
      }
      return false;
   }

   if(res != 200)
   {
      string response = CharArrayToString(result);
      Print("MyTradebook EA: Server returned ", res, ": ", response);
      return false;
   }

   return true;
}
//+------------------------------------------------------------------+
