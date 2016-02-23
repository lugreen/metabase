import React, { Component, PropTypes } from "react";

import Visualization from "metabase/visualizations/components/Visualization.jsx";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.jsx";
import Icon from "metabase/components/Icon.jsx";
import Tooltip from "metabase/components/Tooltip.jsx";
import CheckBox from "metabase/components/CheckBox.jsx";

import Query from "metabase/lib/query";

import visualizations from "metabase/visualizations";

import _ from "underscore";
import cx from "classnames";

function getQueryColumns(card, databases) {
    let dbId = card.dataset_query.database;
    if (card.dataset_query.type !== "query") {
        return null;
    }
    let query = card.dataset_query.query;
    let table = databases && databases[dbId] && databases[dbId].tables_lookup[query.source_table];
    if (!table) {
        return null;
    }
    return Query.getQueryColumns(table, query);
}

export default class AddSeriesModal extends Component {
    constructor(props, context) {
        super(props, context);

        this.state = {
            searchValue: "",
            error: null,
            series: props.dashcard.series || [],
            badCards: {}
        };

        _.bindAll(this, "onSearchChange", "onDone", "filteredCards")
    }

    static propTypes = {
        dashcard: PropTypes.object.isRequired,
        cards: PropTypes.array,
        cardData: PropTypes.object.isRequired,
        fetchCards: PropTypes.func.isRequired,
        fetchCardData: PropTypes.func.isRequired,
        fetchDatabaseMetadata: PropTypes.func.isRequired,
        setDashCardAttributes: PropTypes.func.isRequired,
        onClose: PropTypes.func.isRequired
    };
    static defaultProps = {};

    async componentDidMount() {
        try {
            await this.props.fetchCards();
            await Promise.all(_.uniq(this.props.cards.map(c => c.database_id)).map(db_id =>
                this.props.fetchDatabaseMetadata(db_id)
            ));
        } catch (error) {
            console.error(error);
            this.setState({ error });
        }
    }

    onSearchChange(e) {
        this.setState({ searchValue: e.target.value.toLowerCase() });
    }

    async onCardChange(card, e) {
        const { dashcard } = this.props;
        let CardVisualization = visualizations.get(dashcard.card.display);
        try {
            if (e.target.checked) {
                if (this.props.cardData[card.id] === undefined) {
                    this.setState({ state: "loading" });
                    await this.props.fetchCardData(card);
                }
                let sourceDataset = this.props.cardData[dashcard.card.id];
                let seriesDataset = this.props.cardData[card.id];
                if (CardVisualization.seriesAreCompatible(
                    { card: dashcard.card, data: sourceDataset.data },
                    { card: card, data: seriesDataset.data }
                )) {
                    this.setState({
                        state: null,
                        series: this.state.series.concat(card)
                    });
                } else {
                    this.setState({
                        state: "incompatible",
                        badCards: { ...this.state.badCards, [card.id]: true }
                    });
                    setTimeout(() => this.setState({ state: null }), 2000);
                }
            } else {
                this.setState({ series: this.state.series.filter(c => c.id !== card.id) });
            }
        } catch (e) {
            console.error("onCardChange", e)
        }
    }

    onDone() {
        this.props.setDashCardAttributes({
            id: this.props.dashcard.id,
            attributes: { series: this.state.series }
        });
        this.props.onClose();
    }

    filteredCards() {
        const { cards, dashcard, databases, cardData } = this.props;
        const { searchValue } = this.state;

        const initialSeries = {
            card: dashcard.card,
            data: cardData[dashcard.card.id] && cardData[dashcard.card.id].data
        };

        const CardVisualization = visualizations.get(dashcard.card.display);

        return cards.filter(card => {
            try {
                // filter out the card itself
                if (card.id === dashcard.card.id) {
                    return false;
                }
                if (card.dataset_query.type === "query") {
                    if (!CardVisualization.seriesAreCompatible(initialSeries,
                        { card: card, data: { cols: getQueryColumns(card, databases) } }
                    )) {
                        return false;
                    }
                }
                // search
                if (searchValue && card.name.toLowerCase().indexOf(searchValue) < 0) {
                    return false;
                }
                return true;
            } catch (e) {
                console.warn(e);
                return false;
            }
        });
    }

    render() {
        const { dashcard, cardData, cards } = this.props;

        let error = this.state.error;

        let filteredCards;
        if (!error && cards) {
            filteredCards = this.filteredCards();
            if (filteredCards.length === 0) {
                error = new Error("Whoops, no compatible questions match your search.");
            }
            // SQL cards at the bottom
            filteredCards.sort((a, b) => {
                if (a.dataset_query.type !== "query") {
                    return 1;
                } else if (b.dataset_query.type !== "query") {
                    return -1;
                } else {
                    return 0;
                }
            })
        }

        let badCards = this.state.badCards;

        let enabledCards = {};
        for (let c of this.state.series) {
            enabledCards[c.id] = true;
        }

        let series = [dashcard.card].concat(this.state.series).map(card => ({
            card: card,
            data: cardData[card.id] && cardData[card.id].data
        })).filter(s => !!s.data);

        return (
            <div className="absolute top left bottom right flex">
                <div className="flex flex-column flex-full">
                    <div className="flex-no-shrink h3 pl4 pt4 pb1 text-bold">Add data</div>
                    <div className="flex-full mx1 relative">
                        <Visualization
                            className="absolute top left bottom right"
                            series={series}
                            isDashboard={true}
                            isMultiseries={true}
                        />
                        { this.state.state &&
                            <div className="absolute top left bottom right flex layout-centered" style={{ backgroundColor: "rgba(255,255,255,0.80)" }}>
                                { this.state.state === "loading" ?
                                    <div className="h3 rounded bordered p3 bg-white shadowed">Applying Question</div>
                                : this.state.state === "incompatible" ?
                                    <div className="h3 rounded bordered p3 bg-error border-error text-white">That question isn't compatible</div>
                                : null }
                            </div>
                        }
                    </div>
                    <div className="flex-no-shrink pl4 pb4 pt1">
                        <button className="Button Button--primary" onClick={this.onDone}>Done</button>
                        <button className="Button Button--borderless" onClick={this.props.onClose}>Cancel</button>
                    </div>
                </div>
                <div className="border-left flex flex-column" style={{width: 370, backgroundColor: "#F8FAFA", borderColor: "#DBE1DF" }}>
                    <div className="flex-no-shrink border-bottom flex flex-row align-center" style={{ borderColor: "#DBE1DF" }}>
                        <Icon className="ml2" name="search" width={16} height={16} />
                        <input className="h4 input full pl1" style={{ border: "none", backgroundColor: "transparent" }} type="search" placeholder="Search for a question" onChange={this.onSearchChange}/>
                    </div>
                    <LoadingAndErrorWrapper className="flex flex-full" loading={!filteredCards} error={error} noBackground>
                    { () =>
                        <ul className="flex-full scroll-y scroll-show pr1">
                        {filteredCards.map(card =>
                            <li key={card.id} className={cx("my1 pl2 py1 flex align-center", { disabled: badCards[card.id] })}>
                                <span className="px1 flex-no-shrink">
                                    <CheckBox checked={enabledCards[card.id]} onChange={this.onCardChange.bind(this, card)}/>
                                </span>
                                <span className="px1">
                                    {card.name}
                                </span>
                                { card.dataset_query.type !== "query" &&
                                    <Tooltip tooltip="We're not sure if this question is compatible">
                                        <span className="px1 flex-align-right">
                                            <Icon className="text-grey-2 text-grey-4-hover cursor-pointer" name="warning" width={20} height={20} />
                                        </span>
                                    </Tooltip>
                                }
                            </li>
                        )}
                        </ul>
                    }
                    </LoadingAndErrorWrapper>
                </div>
            </div>
        );
    }
}