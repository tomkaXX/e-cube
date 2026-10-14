# E-Cube: Swiss PFC 2035
**Partner**: external pageE-CUBE Strategy Consultants
**Contacts**: Bruno Meuriot, Nicolas Charton

### General Description and Problem Formulation
The electricity Spot price is determined on a daily basis, in a day-ahead auction process. For portfolio management and hedging purposes, market actors must rely on a “Price Forward Curve” (PFC), that corresponds to the best estimation of the  Spot price formation in the long term (usually 3 – 5 years ahead but also up to 10 – 20 years).
Historically, the Swiss Spot price curve has been mainly influenced by the demand, the nuclear and hydro production, and by the available import/export capacities with the neighboring countries FR, DE and IT (“transit”).
The development of renewable capacities (in particular PV in Switzerland) but also development of decentralized flexibility (batteries, demand-side management, PV injection management …) has an influence on the shape of the Spot prices, and thus on the PFCs used by market actors. For them, the challenge is to estimate as accurately as possible the future Spot curve shape, in order to do the right hedging decisions or investment decisions in production or flexibility assets.
We assume an hourly resolution for the PFC (even if a shift to 15’ resolution is expected by the end of 2025 in Switzerland)

### Research Questions
What parameters influences the shape of the Swiss Spot price curve? This parameter could refer to market situation (demand, production of conventional assets,…), network (available cross-border capacities), renewable production, flexibility management,…
How could the Swiss PFC in 2035 look like? This could be solved with a machine learning approach (or other approach if deemed more relevant)
What is the sensitivity of the PFC to the parameters? How stable is the result of the modeled PFC if key framework conditions evolve (e.g. redefinition of the targets for PV deployment in Switzerland by 2035)?

### Deliverables
The model (Code) to estimate the hourly Swiss PFC in 2035, including an interface to visualize the results of the model (e.g. web based visualisation)
A report in Power Point format presenting the approach (data used, methodology, assumptions,…) and the key outcomes (answering to the questions, max 10 – 12 slides)
The report includes a discussion on the respective influence of the different parameter on the PFC shape
Expertise Required

Data science competences:
Data analysis and data exploration
Coding and implementation of machine learning models
Setup of data visualization interface
Basic understanding of Power markets

### References
**Example of Spot Price**: external pagehttps://www.epexspot.com/en/market-results ; external pagehttps://www.rte-france.com/donnees-publications/eco2mix-donnees-temps-reel/donnees-marche#
Historical Spot, market, network and production data: external pagehttps://transparency.entsoe.eu/
**Swiss targets for PV 2030**: 18.7 TWh/y external page https://www.admin.ch/de/newnsb/dvb52hRdMmNdS3aNKL96C
**Swiss targets for PV 2035**: Art. 2 Abs. 1 EnG external page https://www.fedlex.admin.ch/eli/cc/2017/762/de
